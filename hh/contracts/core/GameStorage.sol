// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
import "./GameTypes.sol";

/**
 * @title GameStorage
 * @notice Shared state, events, access control and the small "FHE engine" helpers used by every game module
 *         (RoomModule, PlayModule, MeetingModule, SettlementModule, ModuleApi). Nothing here is externally callable
 *         except the public getters of constants/config.
 */
abstract contract GameStorage {
    // ───────────────────────────── CONSTANTS ─────────────────────────────
    uint8 public constant MAX_PLAYERS = MAX_SLOTS; // total slots (humans + bots)
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
    /// @dev A public (Quick Match) lobby with >= MIN_PVP_PLAYERS can be started by ANY member after this many seconds.
    uint64 public constant PUBLIC_AUTOSTART_DELAY = 120;

    uint8 internal constant ROLE_CREW = 0;
    uint8 internal constant ROLE_IMPOSTOR = 1;

    // ───────────────────────────── STORAGE ─────────────────────────────
    uint256 public roomCount;
    mapping(uint256 => Room) internal _rooms;
    mapping(uint256 => Player[]) internal _players; // index = slotId (humans first, then bots)
    mapping(uint256 => mapping(address => uint8)) internal _slotPlusOne;
    mapping(uint256 => bytes32[]) internal _pending; // handles waiting for public decryption
    mapping(uint256 => uint8) internal _deathSlot; // slot whose death proof is pending
    mapping(uint256 => bytes32[]) internal _roleHandles; // handles made public by revealRoles (verified by settleRoom)
    mapping(uint256 => mapping(uint8 => bool)) internal _isWinner; // set by settleRoom
    /// @dev Every voter's encrypted ballot of every meeting round (kept so the BribeEscrow can check compliance without revealing the vote).
    mapping(uint256 => mapping(uint32 => mapping(uint8 => euint8))) internal _ballots;

    // ───────────────────────────── WIRING (one shot) ─────────────────────────────
    /// @notice The account that deployed the game; the only one allowed to call `configure` (once).
    address public immutable deployer;
    /// @notice StakeVault (escrow of the encrypted cUSDT stakes). address(0) = staking disabled.
    address public vault;
    /// @notice LostIslandStats (leaderboard). address(0) = no statistics.
    address public stats;
    bool public configured;
    /// @notice Satellite contracts allowed to call the module hooks (BountyBoard, BribeEscrow, ...).
    mapping(address => bool) public isModule;

    constructor() {
        deployer = msg.sender;
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

    event GameConfigured(address vault, address stats);

    // ───────────────────────────── MODIFIERS ─────────────────────────────
    modifier inPhase(uint256 roomId, Phase p) {
        require(_rooms[roomId].phase == p, "Wrong phase");
        _;
    }

    modifier onlyModule() {
        require(isModule[msg.sender], "Not a module");
        _;
    }

    // ═════════════════════════════════════════════════════════════════════
    //                      SHARED INTERNAL HELPERS (FHE engine)
    // ═════════════════════════════════════════════════════════════════════

    /// @dev Caller must be a room member, or the room's session-wallet operator.
    function _requireMemberOrOperator(uint256 roomId) internal view {
        address op = _rooms[roomId].operator;
        if (op != address(0) && msg.sender == op) return;
        _slotOf(roomId, msg.sender);
    }

    function _slotOf(uint256 roomId, address who) internal view returns (uint8) {
        uint8 s = _slotPlusOne[roomId][who];
        require(s != 0, "Not in room");
        return s - 1;
    }

    /// @dev Store the new status and re-grant access (every FHE op makes a NEW handle, so the ACL must be re-granted).
    function _setStatus(Player storage p, euint8 s) internal {
        p.status = s;
        FHE.allowThis(s);
        if (!p.isBot) FHE.allow(s, p.wallet); // a player can always read their own status
    }

    function _applyKill(Player[] storage ps, uint8 killerSlot, ebool canKill, euint8 target) internal {
        for (uint8 i = 0; i < ps.length; i++) {
            if (i == killerSlot) continue; // plaintext: no self-kill
            Player storage v = ps[i];
            ebool hit = FHE.and(FHE.and(canKill, FHE.eq(target, i)), FHE.eq(v.role, ROLE_CREW));
            _setStatus(v, FHE.select(hit, FHE.asEuint8(0), v.status));
        }
    }

    function _addTask(Room storage r, euint8 role) internal {
        euint8 inc = FHE.select(FHE.eq(role, ROLE_IMPOSTOR), FHE.asEuint8(0), FHE.asEuint8(1));
        r.taskProgress = FHE.add(r.taskProgress, inc);
        FHE.allowThis(r.taskProgress);
    }

    function _accumulateVote(Room storage r, Player[] storage ps, euint8 voterStatus, euint8 vote) internal {
        for (uint8 i = 0; i < r.totalSlots; i++) {
            ebool valid = FHE.and(FHE.eq(vote, i), FHE.eq(ps[i].status, 1));
            euint8 add = FHE.select(valid, voterStatus, FHE.asEuint8(0));
            r.voteCounts[i] = FHE.add(r.voteCounts[i], add);
            FHE.allowThis(r.voteCounts[i]);
        }
    }

    /// @dev One bot's turn: do a task; an Impostor bot (if any) kills at random.
    ///      The bot "AI" is just encrypted randomness: the contract never knows in plaintext which bot is the Impostor.
    function _botTurn(Room storage r, Player[] storage ps, uint8 b) internal {
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
    function _computeWinFlags(uint256 roomId) internal returns (ebool impWin, ebool tasksDone) {
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

    function _publish(ebool v) internal returns (bytes32) {
        FHE.makePubliclyDecryptable(v);
        return FHE.toBytes32(v);
    }

    function _publish(euint8 v) internal returns (bytes32) {
        FHE.makePubliclyDecryptable(v);
        return FHE.toBytes32(v);
    }

    function _finish(uint256 roomId, Winner w) internal {
        Room storage r = _rooms[roomId];
        r.winner = w;
        r.phase = Phase.Finished;
        emit GameEnded(roomId, w);
    }
}
