// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
import "./GameStorage.sol";
import { IStakeVaultGame } from "../interfaces/IStakeVault.sol";

/**
 * @title RoomModule
 * @notice Rooms and lobbies: free / staked / public (Quick Match) rooms, joining, the encrypted role deal and the
 *         solo one-transaction start. Stakes are escrowed by the separate StakeVault contract.
 */
abstract contract RoomModule is GameStorage {
    // ═════════════════════════════════════════════════════════════════════
    //                           ROOM MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Create a free room. isSolo = true -> 1 human + 10 bots (bots are added on start).
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
    ///         `cUSDT.setOperator(vault, until)`. The stake is moved with an ENCRYPTED transfer into the StakeVault, so the
    ///         pot and each player's balance never become public. The winning side shares the pot (see settleRoom).
    ///         The room is private: players need its id (or link) to join.
    function createStakedRoom(uint64 stake) external returns (uint256 roomId) {
        require(vault != address(0), "Staking disabled");
        require(stake > 0, "Stake is zero");
        return _newRoom(stake, false);
    }

    /// @notice Create a PUBLIC PvP room that shows up in Quick Match (`getOpenRooms`). stake = 0 -> free room.
    function createOpenRoom(uint64 stake) external returns (uint256 roomId) {
        if (stake > 0) require(vault != address(0), "Staking disabled");
        return _newRoom(stake, true);
    }

    function _newRoom(uint64 stake, bool isPublic) private returns (uint256 roomId) {
        roomId = ++roomCount;
        Room storage r = _rooms[roomId];
        r.host = msg.sender;
        r.phase = Phase.Lobby;
        r.createdAt = uint64(block.timestamp);
        r.stake = stake;
        r.isPublic = isPublic;
        if (stake > 0) IStakeVaultGame(vault).openRoom(roomId);

        _addHuman(roomId, msg.sender);
        emit RoomCreated(roomId, msg.sender, false);
        if (stake > 0) emit StakeSet(roomId, stake);
    }

    /// @notice Join a PvP room (up to MAX_PLAYERS). Staked rooms charge the stake here (needs the cUSDT operator approval of the vault).
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
     *         The host starts a private room. A PUBLIC room can also be started by any member once PUBLIC_AUTOSTART_DELAY
     *         seconds passed, so a Quick Match lobby never hangs because the host went away.
     *
     * Role deal (exactly one Impostor):
     *   impIdx = FHE.rem(FHE.randEuint8(128), n)            // Impostor slot, encrypted
     *   role_i = FHE.select(FHE.eq(impIdx, i), 1, 0)        // encrypted
     *   FHE.allow(role_i, wallet_i)                         // ONLY wallet i can decrypt it
     *
     * Bots: the handle is `allowThis` only -> only the contract can use it (bots act inside FHE).
     * `randEuint8(128)` then `rem n`: for n = 11 the draw is biased by ~0.8% (documented, acceptable).
     */
    function startGame(uint256 roomId) external inPhase(roomId, Phase.Lobby) {
        Room storage r = _rooms[roomId];
        bool isHost = msg.sender == r.host;
        bool lateMember = r.isPublic &&
            _slotPlusOne[roomId][msg.sender] != 0 &&
            block.timestamp >= uint256(r.createdAt) + PUBLIC_AUTOSTART_DELAY;
        require(isHost || lateMember, "Only host");
        _start(roomId);
    }

    /// @notice Solo in ONE transaction: create the room, register the session-wallet operator (address(0) = none),
    ///         add the 10 bots, deal the encrypted roles and start the game. One signature instead of three.
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

    function _addHuman(uint256 roomId, address who) private {
        Room storage r = _rooms[roomId];
        Player[] storage ps = _players[roomId];
        ps.push();
        Player storage p = ps[ps.length - 1];
        p.wallet = who;
        uint8 slot = uint8(ps.length - 1);
        require(_principalOf[roomId][who] == address(0), "Session key cannot join");
        _slotPlusOne[roomId][who] = slot + 1;
        r.humanCount++;
        // Staked room: the vault pulls the stake with an ENCRYPTED ERC-7984 transfer and records what was REALLY paid.
        if (r.stake > 0) IStakeVaultGame(vault).deposit(roomId, who, r.stake);
        emit PlayerJoined(roomId, who, slot);
    }

    // ───────────────────────────── SOLO OPERATOR ─────────────────────────────

    /// @notice Solo only: a room member registers a session wallet (kept in the browser) that may run the technical,
    ///         role-free steps - bot turns, bot votes, opening a meeting, tally and checkpoint requests - so the player is not
    ///         asked to sign for the bots. The operator also plays for the single human (secret/dummy act, task, vote, death reports) so nothing pops up mid-game; it can never move money.
    function setOperator(uint256 roomId, address op) external {
        Room storage r = _rooms[roomId];
        require(r.isSolo, "Solo only");
        require(r.phase == Phase.Lobby || r.phase == Phase.Playing, "Wrong phase");
        _slotOf(roomId, msg.sender);
        r.operator = op;
        emit OperatorSet(roomId, op);
    }

    /// @notice PvP and solo: a room member registers a throw-away SESSION WALLET (kept in their browser) that may play for them
    ///         (secret kill, task, vote, meeting, checkpoint, death proof) WITHOUT a wallet popup. It can never move money
    ///         (stake, payout, bribe) or act as anyone else, and it only works inside this room.
    function setSessionKey(uint256 roomId, address key) external {
        Room storage r = _rooms[roomId];
        require(r.phase == Phase.Lobby || r.phase == Phase.Playing || r.phase == Phase.Voting, "Wrong phase");
        require(_slotPlusOne[roomId][msg.sender] != 0, "Not in room");
        require(key != address(0) && key != msg.sender, "Bad key");
        require(_slotPlusOne[roomId][key] == 0, "Key is a player");
        address holder = _principalOf[roomId][key];
        require(holder == address(0) || holder == msg.sender, "Key in use");
        address old = _sessionOf[roomId][msg.sender];
        if (old != address(0)) delete _principalOf[roomId][old];
        _sessionOf[roomId][msg.sender] = key;
        _principalOf[roomId][key] = msg.sender;
        emit SessionKeySet(roomId, msg.sender, key);
    }

    function sessionKeyOf(uint256 roomId, address player) external view returns (address) {
        return _sessionOf[roomId][player];
    }

    function operatorOf(uint256 roomId) external view returns (address) {
        return _rooms[roomId].operator;
    }

    // ───────────────────────────── QUICK MATCH ─────────────────────────────

    /// @notice Public lobbies that still have room, newest first. Scans at most `maxScan` rooms downwards from `scanFrom`
    ///         (0 = from the newest room). Costs nothing: it is a view.
    function getOpenRooms(
        uint256 scanFrom,
        uint256 maxScan
    ) external view returns (uint256[] memory ids, uint64[] memory stakes, uint8[] memory counts) {
        uint256 top = (scanFrom == 0 || scanFrom > roomCount) ? roomCount : scanFrom;
        uint256 low = top > maxScan ? top - maxScan : 0;
        uint256 n = 0;
        for (uint256 id = top; id > low; id--) {
            if (_isOpen(id)) n++;
        }
        ids = new uint256[](n);
        stakes = new uint64[](n);
        counts = new uint8[](n);
        uint256 k = 0;
        for (uint256 id = top; id > low; id--) {
            if (_isOpen(id)) {
                Room storage r = _rooms[id];
                ids[k] = id;
                stakes[k] = r.stake;
                counts[k] = r.humanCount;
                k++;
            }
        }
    }

    function _isOpen(uint256 id) private view returns (bool) {
        Room storage r = _rooms[id];
        return
            r.isPublic &&
            r.phase == Phase.Lobby &&
            r.humanCount < MAX_PLAYERS &&
            block.timestamp < uint256(r.createdAt) + LOBBY_TIMEOUT;
    }

    /// @notice Is the room listed in Quick Match, and when was it created.
    function getRoomExtra(uint256 roomId) external view returns (bool isPublic, uint64 createdAt) {
        Room storage r = _rooms[roomId];
        return (r.isPublic, r.createdAt);
    }
}
