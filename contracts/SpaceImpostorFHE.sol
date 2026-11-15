// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, euint64, ebool, externalEuint8 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984 } from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";

/**
 * @title  SpaceImpostorFHE ("Lost Island")
 * @notice Social-deduction game (one hidden spy among a squad) on the Zama FHEVM, with optional encrypted
 *         ERC-7984 (cUSDT) stakes. Nothing that must stay secret is ever stored or emitted in clear.
 *
 * ENCRYPTED: every role (who the spy is), every alive/dead status, the spy's kill target, every vote,
 *            the task counter, and (staked rooms) every player's paid stake and the pot.
 * PUBLIC (only through the KMS: makePubliclyDecryptable -> relayer publicDecrypt -> FHE.checkSignatures):
 *            checkpoint win flags, vote result + ejected role, a player's own death proof, and - once the
 *            game is Finished - every role, so anyone can audit that the winner (and payout) was legitimate.
 *
 * NO DATA-DEPENDENT REVERTS: a secret condition (am I the spy? is the target alive?) is computed as `ebool`
 * and applied with `FHE.select`, so a transaction succeeds whether or not it had an effect. Otherwise a
 * revert (or its absence) would leak the role.
 *
 * RANDOMNESS: the spy is drawn with `FHE.randEuint8` inside the FHE coprocessor - nobody (not the host, not a
 * validator, not the contract) can predict or bias it - and the draw is publicly verifiable at game end.
 */
contract SpaceImpostorFHE is ZamaEthereumConfig {
    // ───────────────────────────── CONSTANTS ─────────────────────────────
    uint8 public constant MAX_PLAYERS = 7; // total slots (humans + bots)
    uint8 public constant MIN_PVP_PLAYERS = 3;
    uint8 public constant SOLO_BOTS = 6;
    /// @dev Bots processed per transaction (bot turns / bot votes). Batched so one tx stays under the FHE compute budget (HCU).
    uint8 public constant BOTS_PER_TX = 3;
    uint8 public constant TASKS_PER_PLAYER = 3;
    uint8 public constant NO_TARGET = 255; // vote "skip" / nobody is ejected
    uint64 public constant VOTE_DURATION = 120; // seconds
    /// @dev A staked lobby nobody started can be cancelled by anyone after this long (host can cancel any time).
    uint64 public constant LOBBY_TIMEOUT = 1 days;
    /// @dev A staked game that never finished can be aborted by anyone after this long; every player is refunded.
    uint64 public constant GAME_TIMEOUT = 2 days;

    uint8 private constant ROLE_CREW = 0;
    uint8 private constant ROLE_IMPOSTOR = 1;

    // ───────────────────────────── TYPES ─────────────────────────────
    enum Phase {
        Lobby,
        Playing,
        Voting,
        Tallying, // waiting for the KMS-signed public decryption of the vote result
        Finished,
        Cancelled // staked room that never finished: every player can claim a refund
    }

    enum Winner {
        None,
        Crewmates,
        Impostors,
        FriendlyFire // the squad executed a player after friendly fire: mission over, the spy was never found
    }

    enum PendingKind {
        None,
        Checkpoint,
        Tally,
        Death // proof that the caller's own (encrypted) status is Dead
    }

    struct Player {
        address wallet; // address(0) for a bot
        bool isBot;
        bool hasVoted; // plaintext: voted this round (leaks nothing about the role)
        bool ejected; // plaintext: removed by vote or proven dead (already public)
        uint8 tasksDone; // plaintext; same cap for every role
        uint32 lastActRound; // last round in which executeSecretKill / the bot turn ran
        euint8 role; // 0 = Crewmate, 1 = Impostor   (ENCRYPTED)
        euint8 status; // 1 = Alive,    0 = Dead       (ENCRYPTED)
        euint64 paid; // staked rooms: ENCRYPTED amount of cUSDT this player really paid in (0 if the transfer failed)
        bool claimed; // plaintext: refund / payout already claimed
    }

    struct Room {
        address host;
        bool isSolo;
        Phase phase;
        Winner winner;
        PendingKind pendingKind;
        uint8 humanCount;
        uint8 totalSlots; // humans + bots
        uint8 taskTarget; // total crew tasks needed to win
        uint8 votesCast;
        uint32 round;
        uint32 lastCheckpointRound;
        uint64 voteDeadline;
        address operator; // Solo: session wallet allowed to run the bots / tally / checkpoint (no MetaMask popups)
        uint64 stake; // staked rooms: public entry fee per player (cUSDT base units). 0 = free room. Balances stay encrypted.
        uint64 createdAt;
        uint64 startedAt;
        uint8 winnersCount; // set by settleStake: size of the winning side (all of its members, dead or alive)
        bool settled; // stake roles verified, payouts can be claimed
        euint64 pot; // ENCRYPTED sum of what players really paid in
        euint8 taskProgress; // tasks completed (ENCRYPTED; the spy never adds)
        euint8[MAX_PLAYERS] voteCounts; // votes accumulated per slot (ENCRYPTED)
    }

    // ───────────────────────────── STORAGE ─────────────────────────────
    uint256 public roomCount;
    mapping(uint256 => Room) private _rooms;
    mapping(uint256 => Player[]) private _players; // index = slotId (humans first, then bots)
    mapping(uint256 => mapping(address => uint8)) private _slotPlusOne;
    mapping(uint256 => bytes32[]) private _pending; // handles waiting for public decryption
    mapping(uint256 => uint8) private _deathSlot; // slot whose death proof is pending
    mapping(uint256 => bytes32[]) private _roleHandles; // handles made public by revealRoles (verified by settleStake)
    mapping(uint256 => mapping(uint8 => bool)) private _isWinner; // set by settleStake

    /// @notice ERC-7984 confidential token used for stakes (cUSDT on Sepolia). address(0) = staking disabled.
    IERC7984 public immutable stakeToken;

    constructor(address token) {
        stakeToken = IERC7984(token);
    }

    // ───────────────────────────── EVENTS ─────────────────────────────
    event RoomCreated(uint256 indexed roomId, address indexed host, bool isSolo);
    event PlayerJoined(uint256 indexed roomId, address indexed player, uint8 slotId);
    event GameStarted(uint256 indexed roomId, uint8 totalSlots);
    /// @dev Emitted for EVERY player the same way, so it does not reveal who the Impostor is.
    event Acted(uint256 indexed roomId, uint32 round, uint8 slotId);
    event TaskCompleted(uint256 indexed roomId, uint8 slotId);
    event MeetingCalled(uint256 indexed roomId, uint32 round, uint64 voteDeadline);
    event VoteCast(uint256 indexed roomId, uint8 slotId);
    event DecryptionRequested(uint256 indexed roomId, PendingKind kind, bytes32[] handles);
    event PlayerEjected(uint256 indexed roomId, uint8 slotId, bool wasImpostor);
    event NoEjection(uint256 indexed roomId, uint32 round);
    event GameEnded(uint256 indexed roomId, Winner winner);
    /// @dev A player was gunned down by their own squad after shooting a teammate by mistake.
    event OperatorSet(uint256 indexed roomId, address operator);
    event PlayerExecuted(uint256 indexed roomId, uint8 slotId, uint32 round);
    /// @dev A player shot a squadmate dead. The victim stays dead for the rest of the game.
    event FriendlyKill(uint256 indexed roomId, uint8 killerSlot, uint8 victimSlot, uint32 round);
    /// @dev After the game is over the roles of every slot were made publicly decryptable (who the spy was).
    event RolesRevealed(uint256 indexed roomId);
    /// @dev A player's death was PROVEN by a KMS-signed public decryption of their encrypted status (nothing client-attested).
    event PlayerAssassinated(uint256 indexed roomId, uint8 slotId, uint32 round);
    /// @dev Stake amounts are public room parameters; who paid how much and the pot stay encrypted.
    event StakeSet(uint256 indexed roomId, uint64 stake);
    event RoomCancelled(uint256 indexed roomId);
    event RefundClaimed(uint256 indexed roomId, uint8 slotId);
    event StakeSettled(uint256 indexed roomId, uint8 winnersCount);
    event PayoutClaimed(uint256 indexed roomId, uint8 slotId);

    // ───────────────────────────── MODIFIERS ─────────────────────────────
    modifier inPhase(uint256 roomId, Phase p) {
        require(_rooms[roomId].phase == p, "Wrong phase");
        _;
    }

    // ═════════════════════════════════════════════════════════════════════
    //                           ROOM MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Create a free room. isSolo = true -> 1 human + 6 bots (bots are added on start).
    function createRoom(bool isSolo) external returns (uint256 roomId) {
        roomId = ++roomCount;
        Room storage r = _rooms[roomId];
        r.host = msg.sender;
        r.isSolo = isSolo;
        r.phase = Phase.Lobby;
        r.createdAt = uint64(block.timestamp);

        _addHuman(roomId, msg.sender);
        emit RoomCreated(roomId, msg.sender, isSolo);
    }

    /// @notice Create a PvP room where every player stakes `stake` cUSDT (ERC-7984). The caller must first call
    ///         `cUSDT.setOperator(thisContract, until)`. The stake is moved with an ENCRYPTED transfer, so the
    ///         pot and each player's balance never become public. The winning side shares the pot (see settleStake).
    function createStakedRoom(uint64 stake) external returns (uint256 roomId) {
        require(address(stakeToken) != address(0), "Staking disabled");
        require(stake > 0, "Stake is zero");
        roomId = ++roomCount;
        Room storage r = _rooms[roomId];
        r.host = msg.sender;
        r.phase = Phase.Lobby;
        r.createdAt = uint64(block.timestamp);
        r.stake = stake;
        r.pot = FHE.asEuint64(0);
        FHE.allowThis(r.pot);

        _addHuman(roomId, msg.sender);
        emit RoomCreated(roomId, msg.sender, false);
        emit StakeSet(roomId, stake);
    }

    /// @notice Join a PvP room (up to MAX_PLAYERS). Staked rooms charge the stake here (needs the cUSDT operator approval).
    function joinRoom(uint256 roomId) external inPhase(roomId, Phase.Lobby) {
        Room storage r = _rooms[roomId];
        require(r.host != address(0), "No such room");
        require(!r.isSolo, "Solo room");
        require(r.humanCount < MAX_PLAYERS, "Room full");
        require(_slotPlusOne[roomId][msg.sender] == 0, "Already joined");

        _addHuman(roomId, msg.sender);
    }

    /**
     * @notice Start the game: add bots (Solo), deal ENCRYPTED roles, grant decryption rights.
     *
     * Role deal (exactly one Impostor):
     *   impIdx = FHE.rem(FHE.randEuint8(128), n)            // Impostor slot, encrypted
     *   role_i = FHE.select(FHE.eq(impIdx, i), 1, 0)        // encrypted
     *   FHE.allow(role_i, wallet_i)                         // ONLY wallet i can decrypt it
     *
     * Bots: the handle is `allowThis` only -> only the contract can use it (bots act inside FHE).
     * `randEuint8(128)` then `rem n`: for n = 7 the draw is biased by ~0.8% (documented, acceptable).
     */
    function startGame(uint256 roomId) external inPhase(roomId, Phase.Lobby) {
        require(msg.sender == _rooms[roomId].host, "Only host");
        _start(roomId);
    }

    /// @notice Solo in ONE transaction: create the room, register the session-wallet operator (address(0) = none),
    ///         add the 6 bots, deal the encrypted roles and start the game. One signature instead of three.
    function createSoloGame(address op) external returns (uint256 roomId) {
        roomId = ++roomCount;
        Room storage r = _rooms[roomId];
        r.host = msg.sender;
        r.isSolo = true;
        r.phase = Phase.Lobby;
        _addHuman(roomId, msg.sender);
        emit RoomCreated(roomId, msg.sender, true);
        if (op != address(0)) {
            r.operator = op;
            emit OperatorSet(roomId, op);
        }
        _start(roomId);
    }

    function _start(uint256 roomId) private {
        Room storage r = _rooms[roomId];
        if (r.isSolo) {
            require(r.humanCount == 1, "Solo = 1 player");
            for (uint8 b = 0; b < SOLO_BOTS; b++) {
                _players[roomId].push();
                _players[roomId][_players[roomId].length - 1].isBot = true;
            }
        } else {
            require(r.humanCount >= MIN_PVP_PLAYERS, "Need >= 3 players");
        }

        uint8 n = uint8(_players[roomId].length);
        r.totalSlots = n;
        r.taskTarget = (n - 1) * TASKS_PER_PLAYER; // (n-1) crewmates; the Impostor does not contribute
        r.round = 1;
        r.startedAt = uint64(block.timestamp);

        // ── Deal roles ──
        euint8 impIdx = FHE.rem(FHE.randEuint8(128), n);
        Player[] storage ps = _players[roomId];
        for (uint8 i = 0; i < n; i++) {
            Player storage p = ps[i];

            ebool isImp = FHE.eq(impIdx, i);
            euint8 role = FHE.select(isImp, FHE.asEuint8(ROLE_IMPOSTOR), FHE.asEuint8(ROLE_CREW));
            p.role = role;
            FHE.allowThis(role); // the contract reuses it in later transactions
            if (!p.isBot) FHE.allow(role, p.wallet); // <- ONLY the owner can see the role

            _setStatus(p, FHE.asEuint8(1)); // Alive
        }

        // ── Initialise the encrypted counters ──
        r.taskProgress = FHE.asEuint8(0);
        FHE.allowThis(r.taskProgress);
        for (uint8 i = 0; i < MAX_PLAYERS; i++) {
            r.voteCounts[i] = FHE.asEuint8(0);
            FHE.allowThis(r.voteCounts[i]);
        }

        r.phase = Phase.Playing;
        emit GameStarted(roomId, n);
    }

    // ═════════════════════════════════════════════════════════════════════
    //                           PLAYING PHASE
    // ═════════════════════════════════════════════════════════════════════

    /**
     * @notice Hidden "kill" action. EVERY player calls it once per round (Crewmate = no-op) to hide the role.
     * @param encTarget  victim slotId, encrypted client-side (externalEuint8)
     * @param inputProof input ZK proof (made by the relayer SDK)
     *
     * canKill  = (role == Impostor) AND (status == Alive)                     [ebool]
     * hit_i    = canKill AND (target == i) AND (role_i == Crewmate)           [ebool]
     * status_i = select(hit_i, 0, status_i)
     * No revert depends on encrypted data.
     *
     * Solo: the 6 bots run separately via `runBotTurns` (batches of BOTS_PER_TX bots per tx).
     */
    function executeSecretKill(
        uint256 roomId,
        externalEuint8 encTarget,
        bytes calldata inputProof
    ) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        require(r.pendingKind == PendingKind.None, "Decryption pending");

        uint8 slot = _slotOf(roomId, msg.sender);
        Player[] storage ps = _players[roomId];
        Player storage me = ps[slot];
        require(me.lastActRound < r.round, "Already acted this round");
        me.lastActRound = r.round;

        euint8 target = FHE.fromExternal(encTarget, inputProof); // verifies the proof + gets the handle
        ebool canKill = FHE.and(FHE.eq(me.role, ROLE_IMPOSTOR), FHE.eq(me.status, 1));
        _applyKill(ps, slot, canKill, target);

        emit Acted(roomId, r.round, slot);
    }

    /// @notice Complete 1 task. Only a Crewmate advances the (encrypted) progress; the Impostor "fakes" it.
    function completeTask(uint256 roomId) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        require(r.pendingKind == PendingKind.None, "Decryption pending");

        uint8 slot = _slotOf(roomId, msg.sender);
        Player storage me = _players[roomId][slot];
        require(me.tasksDone < TASKS_PER_PLAYER, "No tasks left"); // same cap for every role
        me.tasksDone++;

        _addTask(r, me.role);
        emit TaskCompleted(roomId, slot);
    }

    /**
     * @notice Check the win conditions (Impostor wins when crew alive <= impostor alive; Crew wins on enough tasks).
     *         Only 2 result bits become public - never an identity or a count.
     *  Step 1/2: this function. Step 2/2: `submitCheckpoint` with the relayer proof.
     */
    function requestCheckpoint(uint256 roomId) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        _requireMemberOrOperator(roomId);
        require(r.pendingKind == PendingKind.None, "Decryption pending");
        require(r.lastCheckpointRound < r.round, "Checkpoint already done");
        r.lastCheckpointRound = r.round;

        (ebool impWin, ebool tasksDone) = _computeWinFlags(roomId);
        bytes32[] storage h = _pending[roomId];
        delete _pending[roomId];
        h.push(_publish(impWin));
        h.push(_publish(tasksDone));
        r.pendingKind = PendingKind.Checkpoint;

        emit DecryptionRequested(roomId, PendingKind.Checkpoint, h);
    }

    /// @notice Step 2/2 of the checkpoint. `cleartexts` = abi.encode(bool impostorWins, bool tasksDone).
    function submitCheckpoint(
        uint256 roomId,
        bytes calldata cleartexts,
        bytes calldata decryptionProof
    ) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        require(r.pendingKind == PendingKind.Checkpoint, "No checkpoint pending");

        // Verify the KMS signatures for EXACTLY the stored handles (the caller cannot choose handles).
        FHE.checkSignatures(_pending[roomId], cleartexts, decryptionProof);
        delete _pending[roomId];
        r.pendingKind = PendingKind.None;

        (bool impWin, bool tasksDone) = abi.decode(cleartexts, (bool, bool));
        if (tasksDone) _finish(roomId, Winner.Crewmates);
        else if (impWin) _finish(roomId, Winner.Impostors);
    }

    /**
     * @notice Friendly fire: the caller shot squadmate `victim` dead. The victim's (encrypted) status becomes Dead
     *         permanently, so they cannot act or vote and they count as dead in every win check.
     *         Their role stays hidden: if they happened to be the impostor, the next checkpoint ends the game
     *         with a Commando win (no impostor left alive) without ever revealing who it was.
     * @dev    Client-attested like `reportExecution` (the contract has no positions). Killing the spy with the
     *         secret `executeSecretKill` route is unchanged; this is the public route for any other gun kill.
     */
    function reportFriendlyKill(uint256 roomId, uint8 victim) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        require(r.isSolo, "Solo only: client-attested");   // in PvP nobody may declare another player dead
        uint8 killer = _slotOf(roomId, msg.sender);
        require(victim < r.totalSlots, "Bad victim");
        require(victim != killer, "Cannot target yourself");
        require(!_players[roomId][killer].ejected, "You are dead");
        _setStatus(_players[roomId][victim], FHE.asEuint8(0));
        emit FriendlyKill(roomId, killer, victim, r.round);
    }

    /**
     * @notice Friendly-fire ending. The caller shot a teammate, was marked as the spy by the squad and was
     *         gunned down. This records the death on-chain (status -> Dead, `ejected` = true) and ends the game
     *         immediately with `Winner.FriendlyFire`, even though the real impostor was never found.
     * @dev    Combat is simulated client-side (the contract has no positions), so - exactly like the kill range -
     *         this is client-attested. Only a player of the room can report their OWN death, and only while the
     *         game is running. The role is never revealed: the outcome is the same for Crew and Impostor.
     */
    function reportExecution(uint256 roomId) external {
        Room storage r = _rooms[roomId];
        require(r.isSolo, "Solo only: client-attested");   // in PvP nobody may end the game for everyone
        require(r.phase == Phase.Playing || r.phase == Phase.Voting, "Game not running");
        uint8 slot = _slotOf(roomId, msg.sender);
        Player storage me = _players[roomId][slot];
        require(!me.ejected, "Already dead");

        me.ejected = true;
        _setStatus(me, FHE.asEuint8(0));
        // Drop any half-finished decryption request so nothing can resolve the game a second time.
        delete _pending[roomId];
        r.pendingKind = PendingKind.None;

        emit PlayerExecuted(roomId, slot, r.round);
        _finish(roomId, Winner.FriendlyFire);
    }

    /**
     * @notice VERIFIABLE death (assassination). Step 1/2: makes the caller's OWN encrypted status publicly decryptable.
     *         It only reveals "dead or alive" of the caller, which the caller already knows.
     */
    function requestDeathProof(uint256 roomId) external {
        Room storage r = _rooms[roomId];
        require(r.phase == Phase.Playing || r.phase == Phase.Voting, "Game not running");
        require(r.pendingKind == PendingKind.None, "Decryption pending");
        uint8 slot = _slotOf(roomId, msg.sender);
        require(!_players[roomId][slot].ejected, "Already dead");

        bytes32[] storage h = _pending[roomId];
        delete _pending[roomId];
        h.push(_publish(_players[roomId][slot].status));
        _deathSlot[roomId] = slot;
        r.pendingKind = PendingKind.Death;
        emit DecryptionRequested(roomId, PendingKind.Death, h);
    }

    /// @notice Step 2/2. `cleartexts` = abi.encode(uint8 status). The KMS signatures are checked against the stored handle,
    ///         so the caller cannot claim a death that did not happen (a still-alive status just closes the request). Solo: the game ends (the spy won). PvP: the player is out, the game goes on.
    function submitDeathProof(uint256 roomId, bytes calldata cleartexts, bytes calldata decryptionProof) external {
        Room storage r = _rooms[roomId];
        require(r.phase == Phase.Playing || r.phase == Phase.Voting, "Game not running");
        require(r.pendingKind == PendingKind.Death, "No death proof pending");

        FHE.checkSignatures(_pending[roomId], cleartexts, decryptionProof);
        delete _pending[roomId];
        r.pendingKind = PendingKind.None;

        uint8 status = abi.decode(cleartexts, (uint8));
        // A living player may request a proof too. Do NOT revert then: the pending request is already cleared above,
        // so a griefer cannot freeze the room by requesting a proof that can never be accepted.
        if (status != 0) return;
        uint8 slot = _deathSlot[roomId];
        _players[roomId][slot].ejected = true;
        emit PlayerAssassinated(roomId, slot, r.round);
        if (r.isSolo) _finish(roomId, Winner.Impostors);
    }

    // ═════════════════════════════════════════════════════════════════════
    //                         BOTS (SOLO) - BATCHED
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Solo: run the bots' turn (do a task; an Impostor bot kills at random), at most BOTS_PER_TX bots per transaction.
    ///         The client calls it repeatedly until `pendingBotTurns` = 0 (each bot runs once per round).
    function runBotTurns(uint256 roomId) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        require(r.isSolo, "Solo only");
        _requireMemberOrOperator(roomId);
        require(r.pendingKind == PendingKind.None, "Decryption pending");

        Player[] storage ps = _players[roomId];
        uint8 done = 0;
        for (uint8 b = r.humanCount; b < r.totalSlots && done < BOTS_PER_TX; b++) {
            if (ps[b].lastActRound >= r.round) continue;
            ps[b].lastActRound = r.round;
            done++;
            _botTurn(r, ps, b);
        }
        require(done > 0, "Bots already acted");
    }

    /// @notice Solo: bots vote at random (encrypted), at most BOTS_PER_TX bots per transaction. All must finish before `tallyVotes`.
    function runBotVotes(uint256 roomId) external inPhase(roomId, Phase.Voting) {
        Room storage r = _rooms[roomId];
        require(r.isSolo, "Solo only");
        _requireMemberOrOperator(roomId);

        Player[] storage ps = _players[roomId];
        uint8 done = 0;
        for (uint8 b = r.humanCount; b < r.totalSlots && done < BOTS_PER_TX; b++) {
            if (ps[b].hasVoted) continue;
            ps[b].hasVoted = true;
            done++;
            euint8 vote = FHE.rem(FHE.randEuint8(128), r.totalSlots);
            _accumulateVote(r, ps, ps[b].status, vote);
        }
        require(done > 0, "Bots already voted");
    }

    /// @notice Bots that have not acted yet this round (0 if not Solo / not in the Playing phase).
    function pendingBotTurns(uint256 roomId) external view returns (uint8 n) {
        Room storage r = _rooms[roomId];
        if (!r.isSolo || r.phase != Phase.Playing) return 0;
        Player[] storage ps = _players[roomId];
        for (uint8 b = r.humanCount; b < r.totalSlots; b++) {
            if (ps[b].lastActRound < r.round) n++;
        }
    }

    /// @notice Bots that have not voted yet in this meeting (0 if not Solo / not in the Voting phase).
    function pendingBotVotes(uint256 roomId) external view returns (uint8 n) {
        Room storage r = _rooms[roomId];
        if (!r.isSolo || r.phase != Phase.Voting) return 0;
        Player[] storage ps = _players[roomId];
        for (uint8 b = r.humanCount; b < r.totalSlots; b++) {
            if (!ps[b].hasVoted) n++;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //                         MEETING & SHIELDED VOTING
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Open a meeting: reset the votes and let the room read every slot's `status` (body report).
    function callMeeting(uint256 roomId) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        _requireMemberOrOperator(roomId);
        require(r.pendingKind == PendingKind.None, "Decryption pending");

        Player[] storage ps = _players[roomId];
        uint8 n = r.totalSlots;

        for (uint8 i = 0; i < n; i++) {
            r.voteCounts[i] = FHE.asEuint8(0);
            FHE.allowThis(r.voteCounts[i]);
            ps[i].hasVoted = false;

            // Let the whole room see who is alive / dead (room members only, not public).
            for (uint8 j = 0; j < r.humanCount; j++) {
                FHE.allow(ps[i].status, ps[j].wallet);
            }
        }
        r.votesCast = 0;
        r.voteDeadline = uint64(block.timestamp) + VOTE_DURATION;
        r.phase = Phase.Voting;

        emit MeetingCalled(roomId, r.round, r.voteDeadline);
    }

    /**
     * @notice Secret vote. `encVote` = target slotId (or a value >= totalSlots / 255 to skip).
     *
     * For every slot i:
     *   counts_i += select( (vote == i) AND (status_i == Alive), voterStatus, 0 )
     * - A dead voter's ballot has weight 0.
     * - A vote for a dead player is ignored.
     * - Nobody (not even a validator) sees who voted for whom: only ciphertext exists.
     */
    function castShieldedVote(
        uint256 roomId,
        externalEuint8 encVote,
        bytes calldata inputProof
    ) external inPhase(roomId, Phase.Voting) {
        Room storage r = _rooms[roomId];
        require(block.timestamp < r.voteDeadline, "Voting closed");

        uint8 slot = _slotOf(roomId, msg.sender);
        Player[] storage ps = _players[roomId];
        require(!ps[slot].hasVoted, "Already voted");
        ps[slot].hasVoted = true;
        r.votesCast++;

        euint8 vote = FHE.fromExternal(encVote, inputProof);
        _accumulateVote(r, ps, ps[slot].status, vote);

        emit VoteCast(roomId, slot);
    }

    /**
     * @notice Close the vote: find the encrypted argmax, eject the elected player, then request public decryption.
     *  Step 1/2: this function. Step 2/2: `finalizeTally` with the relayer proof.
     *
     * Made public (makePubliclyDecryptable) are ONLY 4 values:
     *   [ejectedSlot (255 = nobody), ejectedRole, impostorWins, tasksDone]
     * Individual ballots are NEVER decrypted.
     * A tie (or no votes at all) => nobody is ejected.
     */
    function tallyVotes(uint256 roomId) external inPhase(roomId, Phase.Voting) {
        Room storage r = _rooms[roomId];
        _requireMemberOrOperator(roomId);
        // Solo: the session-wallet operator (the player's own throw-away key) may close the vote early. That is how a dead player
        // (whose zero-weight vote is pointless) or a player who ran out of time abstains without signing anything.
        bool byOperator = r.isSolo && r.operator != address(0) && msg.sender == r.operator;
        require(byOperator || block.timestamp >= r.voteDeadline || r.votesCast == r.humanCount, "Voting still open");

        Player[] storage ps = _players[roomId];
        uint8 n = r.totalSlots;

        if (r.isSolo) {
            for (uint8 b = r.humanCount; b < n; b++) require(ps[b].hasVoted, "Bots must vote first");
        }

        // ── encrypted argmax + tie detection ──
        euint8 maxV = FHE.asEuint8(0);
        euint8 idx = FHE.asEuint8(NO_TARGET);
        ebool tied = FHE.asEbool(false);
        for (uint8 i = 0; i < n; i++) {
            euint8 c = r.voteCounts[i];
            ebool gt = FHE.gt(c, maxV);
            ebool eqPos = FHE.and(FHE.eq(c, maxV), FHE.gt(c, 0));
            // gt and eqPos are mutually exclusive
            tied = FHE.or(FHE.and(tied, FHE.not(gt)), eqPos);
            maxV = FHE.select(gt, c, maxV);
            idx = FHE.select(gt, FHE.asEuint8(i), idx);
        }
        euint8 ejectIdx = FHE.select(tied, FHE.asEuint8(NO_TARGET), idx);

        // ── apply the ejection to the encrypted status + fetch the ejected role ──
        euint8 ejectedRole = FHE.asEuint8(0);
        for (uint8 i = 0; i < n; i++) {
            Player storage p = ps[i];
            ebool isEj = FHE.eq(ejectIdx, i);
            ejectedRole = FHE.add(ejectedRole, FHE.select(isEj, p.role, FHE.asEuint8(0)));
            _setStatus(p, FHE.select(isEj, FHE.asEuint8(0), p.status));
        }

        (ebool impWin, ebool tasksDone) = _computeWinFlags(roomId);

        bytes32[] storage h = _pending[roomId];
        delete _pending[roomId];
        h.push(_publish(ejectIdx));
        h.push(_publish(ejectedRole));
        h.push(_publish(impWin));
        h.push(_publish(tasksDone));

        r.pendingKind = PendingKind.Tally;
        r.phase = Phase.Tallying;
        emit DecryptionRequested(roomId, PendingKind.Tally, h);
    }

    /// @notice Step 2/2. `cleartexts` = abi.encode(uint8 ejectedSlot, uint8 ejectedRole, bool impostorWins, bool tasksDone).
    function finalizeTally(
        uint256 roomId,
        bytes calldata cleartexts,
        bytes calldata decryptionProof
    ) external inPhase(roomId, Phase.Tallying) {
        Room storage r = _rooms[roomId];
        require(r.pendingKind == PendingKind.Tally, "No tally pending");

        FHE.checkSignatures(_pending[roomId], cleartexts, decryptionProof);
        delete _pending[roomId];
        r.pendingKind = PendingKind.None;

        (uint8 ejectedSlot, uint8 ejectedRole, bool impWin, bool tasksDone) = abi.decode(
            cleartexts,
            (uint8, uint8, bool, bool)
        );

        bool someoneEjected = ejectedSlot < r.totalSlots;
        if (someoneEjected) {
            _players[roomId][ejectedSlot].ejected = true;
            emit PlayerEjected(roomId, ejectedSlot, ejectedRole == ROLE_IMPOSTOR);
        } else {
            emit NoEjection(roomId, r.round);
        }

        // Priority: voted out the Impostor > Impostor has enough force > Crew finished the tasks
        if (someoneEjected && ejectedRole == ROLE_IMPOSTOR) {
            _finish(roomId, Winner.Crewmates);
        } else if (impWin) {
            _finish(roomId, Winner.Impostors);
        } else if (tasksDone) {
            _finish(roomId, Winner.Crewmates);
        } else {
            r.round++;
            r.phase = Phase.Playing;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //                     STAKES (ERC-7984 / cUSDT) - PvP
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Cancel a staked lobby that was never started. Host any time; anyone after LOBBY_TIMEOUT.
    function cancelRoom(uint256 roomId) external inPhase(roomId, Phase.Lobby) {
        Room storage r = _rooms[roomId];
        require(r.stake > 0, "Not a staked room");
        require(msg.sender == r.host || block.timestamp >= r.createdAt + LOBBY_TIMEOUT, "Only host (or after timeout)");
        r.phase = Phase.Cancelled;
        emit RoomCancelled(roomId);
    }

    /// @notice Abort a staked game that stalled (players left). Anyone, after GAME_TIMEOUT. Everyone is refunded.
    function abortStalled(uint256 roomId) external {
        Room storage r = _rooms[roomId];
        require(r.stake > 0, "Not a staked room");
        require(r.phase == Phase.Playing || r.phase == Phase.Voting || r.phase == Phase.Tallying, "Not running");
        require(block.timestamp >= r.startedAt + GAME_TIMEOUT, "Too early");
        r.phase = Phase.Cancelled;
        r.pendingKind = PendingKind.None;
        delete _pending[roomId];
        emit RoomCancelled(roomId);
    }

    /// @notice Cancelled room: each player pulls back exactly what they really paid (encrypted amount).
    function claimRefund(uint256 roomId) external inPhase(roomId, Phase.Cancelled) {
        uint8 slot = _slotOf(roomId, msg.sender);
        Player storage me = _players[roomId][slot];
        require(!me.claimed, "Already claimed");
        me.claimed = true;
        FHE.allowTransient(me.paid, address(stakeToken));
        stakeToken.confidentialTransfer(msg.sender, me.paid);
        emit RefundClaimed(roomId, slot);
    }

    /**
     * @notice Finished staked room, step 2 after `revealRoles`: verifies the KMS-signed cleartext roles of EVERY slot
     *         against the stored handles (so nobody can claim a role that was not dealt) and fixes the winning side.
     *         `cleartexts` is the relayer's abiEncodedClearValues: one 32-byte word per role, in slot order.
     */
    function settleStake(
        uint256 roomId,
        bytes calldata cleartexts,
        bytes calldata decryptionProof
    ) external inPhase(roomId, Phase.Finished) {
        Room storage r = _rooms[roomId];
        require(r.stake > 0, "Not a staked room");
        require(!r.settled, "Already settled");
        bytes32[] storage hs = _roleHandles[roomId];
        require(hs.length == r.totalSlots, "Call revealRoles first");
        require(cleartexts.length == hs.length * 32, "Bad cleartexts");
        FHE.checkSignatures(hs, cleartexts, decryptionProof);

        // Crewmates win -> every crewmate (role 0) is a winner; Impostors win -> the spy (role 1). Dead or alive.
        uint256 wantRole = r.winner == Winner.Impostors ? 1 : 0;
        require(r.winner == Winner.Crewmates || r.winner == Winner.Impostors, "No staked winner");
        uint8 count;
        for (uint8 i = 0; i < hs.length; i++) {
            if (uint256(bytes32(cleartexts[i * 32:(i + 1) * 32])) == wantRole) {
                _isWinner[roomId][i] = true;
                count++;
            }
        }
        require(count > 0, "No winners");
        r.winnersCount = count;
        r.settled = true;
        emit StakeSettled(roomId, count);
    }

    /// @notice Settled room: a winner pulls their equal share of the pot (encrypted transfer). A winner whose own
    ///         stake transfer had failed (balance too low) gets 0, so nobody can free-ride on the pot.
    function claimPayout(uint256 roomId) external inPhase(roomId, Phase.Finished) {
        Room storage r = _rooms[roomId];
        require(r.settled, "Not settled");
        uint8 slot = _slotOf(roomId, msg.sender);
        Player storage me = _players[roomId][slot];
        require(_isWinner[roomId][slot], "Not a winner");
        require(!me.claimed, "Already claimed");
        me.claimed = true;

        euint64 share = FHE.div(r.pot, uint64(r.winnersCount));
        euint64 amount = FHE.select(FHE.eq(me.paid, r.stake), share, FHE.asEuint64(0));
        FHE.allowTransient(amount, address(stakeToken));
        euint64 sent = stakeToken.confidentialTransfer(msg.sender, amount);
        FHE.allow(sent, msg.sender);
        emit PayoutClaimed(roomId, slot);
    }

    function getStakeInfo(
        uint256 roomId
    ) external view returns (uint64 stake, bool settled, uint8 winnersCount, bytes32 potHandle) {
        Room storage r = _rooms[roomId];
        return (r.stake, r.settled, r.winnersCount, FHE.toBytes32(r.pot));
    }

    /// @notice Handle of what a player REALLY paid (encrypted; only that player can decrypt it).
    function getPaidHandle(uint256 roomId, uint8 slotId) external view returns (bytes32) {
        return FHE.toBytes32(_players[roomId][slotId].paid);
    }

    function isWinner(uint256 roomId, uint8 slotId) external view returns (bool) {
        return _isWinner[roomId][slotId];
    }

    function hasClaimed(uint256 roomId, uint8 slotId) external view returns (bool) {
        return _players[roomId][slotId].claimed;
    }

    // ═════════════════════════════════════════════════════════════════════
    //                               VIEWS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Role handle of `player`. Only `player`'s wallet can user-decrypt it (ACL), so returning the handle is safe.
    function getRoleHandle(uint256 roomId, address player) external view returns (euint8) {
        return _players[roomId][_slotOf(roomId, player)].role;
    }

    /// @notice Alive/dead handle of a slot (decryptable once allowed: yourself, or everyone after callMeeting).
    function getStatusHandle(uint256 roomId, uint8 slotId) external view returns (euint8) {
        return _players[roomId][slotId].status;
    }

    function getPendingHandles(uint256 roomId) external view returns (bytes32[] memory) {
        return _pending[roomId];
    }

    function getSlotOf(uint256 roomId, address player) external view returns (uint8) {
        return _slotOf(roomId, player);
    }

    /**
     * @notice Game over -> unlock the roles. Makes the (encrypted) role of EVERY slot publicly decryptable so the
     *         client can show who the spy was. Only possible once the room is Finished, so it never leaks a live game.
     */
    function revealRoles(uint256 roomId) external inPhase(roomId, Phase.Finished) returns (bytes32[] memory handles) {
        _requireMemberOrOperator(roomId);
        Player[] storage ps = _players[roomId];
        handles = new bytes32[](ps.length);
        for (uint256 i = 0; i < ps.length; i++) handles[i] = _publish(ps[i].role);
        _roleHandles[roomId] = handles;
        emit RolesRevealed(roomId);
    }

    /// @notice Role handle of a slot (bots included). Useless until `revealRoles` made it public, so safe to expose.
    function getRoleHandleOf(uint256 roomId, uint8 slotId) external view returns (bytes32) {
        return FHE.toBytes32(_players[roomId][slotId].role);
    }

    function getRoom(
        uint256 roomId
    )
        external
        view
        returns (
            address host,
            bool isSolo,
            Phase phase,
            Winner winner,
            PendingKind pendingKind,
            uint8 humanCount,
            uint8 totalSlots,
            uint32 round,
            uint64 voteDeadline,
            uint8 votesCast
        )
    {
        Room storage r = _rooms[roomId];
        return (
            r.host,
            r.isSolo,
            r.phase,
            r.winner,
            r.pendingKind,
            r.humanCount,
            r.totalSlots,
            r.round,
            r.voteDeadline,
            r.votesCast
        );
    }

    function getPlayers(
        uint256 roomId
    ) external view returns (address[] memory wallets, bool[] memory isBot, bool[] memory ejected) {
        Player[] storage ps = _players[roomId];
        wallets = new address[](ps.length);
        isBot = new bool[](ps.length);
        ejected = new bool[](ps.length);
        for (uint256 i = 0; i < ps.length; i++) {
            wallets[i] = ps[i].wallet;
            isBot[i] = ps[i].isBot;
            ejected[i] = ps[i].ejected;
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    //                            INTERNAL HELPERS
    // ═════════════════════════════════════════════════════════════════════

    function _addHuman(uint256 roomId, address who) private {
        Room storage r = _rooms[roomId];
        Player[] storage ps = _players[roomId];
        ps.push();
        Player storage p = ps[ps.length - 1];
        p.wallet = who;
        uint8 slot = uint8(ps.length - 1);
        _slotPlusOne[roomId][who] = slot + 1;
        r.humanCount++;
        if (r.stake > 0) _collectStake(r, p, who);
        emit PlayerJoined(roomId, who, slot);
    }

    /// @dev Pull the stake with an ENCRYPTED ERC-7984 transfer. If the player's balance is too low the token moves 0
    ///      instead of reverting (a revert would leak the balance), so we record what was REALLY paid, encrypted.
    function _collectStake(Room storage r, Player storage p, address who) private {
        euint64 amount = FHE.asEuint64(r.stake);
        FHE.allowTransient(amount, address(stakeToken));
        euint64 got = stakeToken.confidentialTransferFrom(who, address(this), amount);
        p.paid = got;
        FHE.allowThis(got);
        FHE.allow(got, who); // the player can always check what they paid
        r.pot = FHE.add(r.pot, got);
        FHE.allowThis(r.pot);
    }

    /// @notice Solo only: a room member registers a session wallet (kept in the browser) that may run the technical,
    ///         role-free steps - bot turns, bot votes, opening a meeting, tally and checkpoint requests - so the player is not
    ///         asked to sign for the bots. The operator can NOT act as a player (no kill, vote, task or death report).
    function setOperator(uint256 roomId, address op) external {
        Room storage r = _rooms[roomId];
        require(r.isSolo, "Solo only");
        require(r.phase == Phase.Lobby || r.phase == Phase.Playing, "Wrong phase");
        _slotOf(roomId, msg.sender);
        r.operator = op;
        emit OperatorSet(roomId, op);
    }

    function operatorOf(uint256 roomId) external view returns (address) {
        return _rooms[roomId].operator;
    }

    /// @dev Caller must be a room member, or the room's session-wallet operator.
    function _requireMemberOrOperator(uint256 roomId) private view {
        address op = _rooms[roomId].operator;
        if (op != address(0) && msg.sender == op) return;
        _slotOf(roomId, msg.sender);
    }

    function _slotOf(uint256 roomId, address who) private view returns (uint8) {
        uint8 s = _slotPlusOne[roomId][who];
        require(s != 0, "Not in room");
        return s - 1;
    }

    /// @dev Store the new status and re-grant access (every FHE op makes a NEW handle, so the ACL must be re-granted).
    function _setStatus(Player storage p, euint8 s) private {
        p.status = s;
        FHE.allowThis(s);
        if (!p.isBot) FHE.allow(s, p.wallet); // a player can always read their own status
    }

    function _applyKill(Player[] storage ps, uint8 killerSlot, ebool canKill, euint8 target) private {
        for (uint8 i = 0; i < ps.length; i++) {
            if (i == killerSlot) continue; // plaintext: no self-kill
            Player storage v = ps[i];
            ebool hit = FHE.and(FHE.and(canKill, FHE.eq(target, i)), FHE.eq(v.role, ROLE_CREW));
            _setStatus(v, FHE.select(hit, FHE.asEuint8(0), v.status));
        }
    }

    function _addTask(Room storage r, euint8 role) private {
        euint8 inc = FHE.select(FHE.eq(role, ROLE_IMPOSTOR), FHE.asEuint8(0), FHE.asEuint8(1));
        r.taskProgress = FHE.add(r.taskProgress, inc);
        FHE.allowThis(r.taskProgress);
    }

    function _accumulateVote(Room storage r, Player[] storage ps, euint8 voterStatus, euint8 vote) private {
        for (uint8 i = 0; i < r.totalSlots; i++) {
            ebool valid = FHE.and(FHE.eq(vote, i), FHE.eq(ps[i].status, 1));
            euint8 add = FHE.select(valid, voterStatus, FHE.asEuint8(0));
            r.voteCounts[i] = FHE.add(r.voteCounts[i], add);
            FHE.allowThis(r.voteCounts[i]);
        }
    }

    /// @dev One bot's turn: do a task; an Impostor bot (if any) kills at random.
    ///      The bot "AI" is just encrypted randomness: the contract never knows in plaintext which bot is the Impostor.
    function _botTurn(Room storage r, Player[] storage ps, uint8 b) private {
        Player storage bot = ps[b];

        if (bot.tasksDone < TASKS_PER_PLAYER) {
            bot.tasksDone++;
            _addTask(r, bot.role);
        }

        ebool canKill = FHE.and(FHE.eq(bot.role, ROLE_IMPOSTOR), FHE.eq(bot.status, 1));
        euint8 target = FHE.rem(FHE.randEuint8(128), r.totalSlots);
        _applyKill(ps, b, canKill, target);
    }

    /**
     * @dev impWin    = (crewAlive <= impostorAlive)
     *      tasksDone = (taskProgress >= taskTarget)
     *      crewAlive = aliveTotal - impostorAlive,  impostorAlive = sum(role_i * status_i)
     */
    function _computeWinFlags(uint256 roomId) private returns (ebool impWin, ebool tasksDone) {
        Room storage r = _rooms[roomId];
        Player[] storage ps = _players[roomId];

        euint8 alive = FHE.asEuint8(0);
        euint8 impAlive = FHE.asEuint8(0);
        for (uint8 i = 0; i < r.totalSlots; i++) {
            alive = FHE.add(alive, ps[i].status);
            impAlive = FHE.add(impAlive, FHE.mul(ps[i].role, ps[i].status));
        }
        euint8 crewAlive = FHE.sub(alive, impAlive);

        impWin = FHE.le(crewAlive, impAlive);
        // Commandos also win when no impostor is left alive (e.g. the spy was shot dead).
        tasksDone = FHE.or(FHE.ge(r.taskProgress, r.taskTarget), FHE.eq(impAlive, 0));
    }

    function _publish(ebool v) private returns (bytes32) {
        FHE.makePubliclyDecryptable(v);
        return FHE.toBytes32(v);
    }

    function _publish(euint8 v) private returns (bytes32) {
        FHE.makePubliclyDecryptable(v);
        return FHE.toBytes32(v);
    }

    function _finish(uint256 roomId, Winner w) private {
        Room storage r = _rooms[roomId];
        r.winner = w;
        r.phase = Phase.Finished;
        emit GameEnded(roomId, w);
    }
}
