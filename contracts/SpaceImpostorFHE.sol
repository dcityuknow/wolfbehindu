// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, ebool, externalEuint8 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title  SpaceImpostorFHE
 * @notice On-chain social deduction game (Among-Us style) built on Zama FHEVM.
 *
 * ─────────────────────────── LƯU Ý QUAN TRỌNG VỀ API ZAMA ───────────────────────────
 *  Spec gốc dùng tên cũ (`TFHE`, `TFHE.decrypt()`, `bytes encryptedVote`). Thư viện hiện tại
 *  (package fhevm/solidity 0.13.x) đã đổi:
 *   - `TFHE`                    -> `FHE`
 *   - `TFHE.randEuint8()`       -> `FHE.randEuint8(upperBound)` (upperBound phải là luỹ thừa của 2)
 *   - input mã hoá từ client    -> `externalEuint8` + `bytes inputProof`, kèm `FHE.fromExternal()`
 *   - `TFHE.decrypt()` (sync)   -> KHÔNG TỒN TẠI. Giải mã công khai là bất đồng bộ 3 bước:
 *        (1) on-chain : `FHE.makePubliclyDecryptable(handle)`
 *        (2) off-chain: relayer SDK `publicDecrypt(handles)` -> (cleartexts, decryptionProof)
 *        (3) on-chain : `FHE.checkSignatures(handles, cleartexts, proof)` xác minh chữ ký KMS
 *   - Config                    -> kế thừa `ZamaEthereumConfig`
 *
 * ─────────────────────────────── THIẾT KẾ CHỐNG LỘ THÔNG TIN ────────────────────────
 *  Revert/branch dựa trên giá trị mã hoá là KHÔNG thể. Vì vậy mọi điều kiện bí mật
 *  (bạn có phải Impostor không? mục tiêu còn sống không?) được tính bằng `ebool` và áp dụng
 *  bằng `FHE.select` — giao dịch LUÔN thành công dù kết quả là "no-op".
 *
 *  Hệ quả thiết kế:
 *   1. `executeSecretKill` nhận targetId MÃ HOÁ (không phải uint8 thường): nếu để plaintext thì
 *      chỉ cần nhìn tx là biết ai là Impostor + nạn nhân là ai.
 *   2. MỌI người chơi đều gọi được `executeSecretKill` đúng 1 lần/round (Crewmate = no-op), giới
 *      hạn theo plaintext nên không phân biệt được vai trò qua việc tx thành công hay revert.
 *   3. `completeTask` cũng áp dụng cho mọi người chơi như nhau (Impostor là "fake task").
 *
 *  Vai trò (Role) : `FHE.allow(role, player)` -> chỉ ví đó user-decrypt được.
 *  Trạng thái     : handle `status` được cấp quyền cho cả phòng chỉ khi mở cuộc họp (báo xác chết).
 */
contract SpaceImpostorFHE is ZamaEthereumConfig {
    // ───────────────────────────── CONSTANTS ─────────────────────────────
    uint8 public constant MAX_PLAYERS = 7; // tổng số slot (người + bot)
    uint8 public constant MIN_PVP_PLAYERS = 3;
    uint8 public constant SOLO_BOTS = 6;
    /// @dev Số Bot xử lý mỗi giao dịch (lượt Bot / bỏ phiếu Bot). Chia lô để mỗi tx không vượt ngân sách tính toán FHE (HCU).
    uint8 public constant BOTS_PER_TX = 3;
    uint8 public constant TASKS_PER_PLAYER = 3;
    uint8 public constant NO_TARGET = 255; // vote "skip" / không ai bị eject
    uint64 public constant VOTE_DURATION = 120; // giây

    uint8 private constant ROLE_CREW = 0;
    uint8 private constant ROLE_IMPOSTOR = 1;

    // ───────────────────────────── TYPES ─────────────────────────────
    enum Phase {
        Lobby,
        Playing,
        Voting,
        Tallying, // đang chờ proof giải mã công khai của kết quả vote
        Finished
    }

    enum Winner {
        None,
        Crewmates,
        Impostors
    }

    enum PendingKind {
        None,
        Checkpoint,
        Tally
    }

    struct Player {
        address wallet; // address(0) nếu là Bot
        bool isBot;
        bool hasVoted; // plaintext: đã bỏ phiếu round này chưa (không lộ vai trò)
        bool ejected; // plaintext: bị loại bằng vote (đã công khai)
        uint8 tasksDone; // plaintext, giới hạn bằng nhau cho mọi vai trò
        uint32 lastActRound; // round gần nhất đã gọi executeSecretKill
        euint8 role; // 0 = Crewmate, 1 = Impostor   (MÃ HOÁ)
        euint8 status; // 1 = Alive,    0 = Dead       (MÃ HOÁ)
    }

    struct Room {
        address host;
        bool isSolo;
        Phase phase;
        Winner winner;
        PendingKind pendingKind;
        uint8 humanCount;
        uint8 totalSlots; // humans + bots
        uint8 taskTarget; // tổng task Crewmate cần hoàn thành
        uint8 votesCast;
        uint32 round;
        uint32 lastCheckpointRound;
        uint64 voteDeadline;
        euint8 taskProgress; // số task đã hoàn thành (MÃ HOÁ, Impostor không cộng)
        euint8[MAX_PLAYERS] voteCounts; // phiếu tích luỹ theo slot (MÃ HOÁ)
    }

    // ───────────────────────────── STORAGE ─────────────────────────────
    uint256 public roomCount;
    mapping(uint256 => Room) private _rooms;
    mapping(uint256 => Player[]) private _players; // index = slotId (người trước, bot sau)
    mapping(uint256 => mapping(address => uint8)) private _slotPlusOne;
    mapping(uint256 => bytes32[]) private _pending; // handles đang chờ public-decrypt

    // ───────────────────────────── EVENTS ─────────────────────────────
    event RoomCreated(uint256 indexed roomId, address indexed host, bool isSolo);
    event PlayerJoined(uint256 indexed roomId, address indexed player, uint8 slotId);
    event GameStarted(uint256 indexed roomId, uint8 totalSlots);
    /// @dev Phát cho MỌI người chơi như nhau -> không lộ ai là Impostor.
    event Acted(uint256 indexed roomId, uint32 round, uint8 slotId);
    event TaskCompleted(uint256 indexed roomId, uint8 slotId);
    event MeetingCalled(uint256 indexed roomId, uint32 round, uint64 voteDeadline);
    event VoteCast(uint256 indexed roomId, uint8 slotId);
    event DecryptionRequested(uint256 indexed roomId, PendingKind kind, bytes32[] handles);
    event PlayerEjected(uint256 indexed roomId, uint8 slotId, bool wasImpostor);
    event NoEjection(uint256 indexed roomId, uint32 round);
    event GameEnded(uint256 indexed roomId, Winner winner);

    // ───────────────────────────── MODIFIERS ─────────────────────────────
    modifier inPhase(uint256 roomId, Phase p) {
        require(_rooms[roomId].phase == p, "Wrong phase");
        _;
    }

    // ═════════════════════════════════════════════════════════════════════
    //                           ROOM MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Tạo phòng. isSolo = true -> 1 người + 6 Bot (Bot được thêm lúc startGame).
    function createRoom(bool isSolo) external returns (uint256 roomId) {
        roomId = ++roomCount;
        Room storage r = _rooms[roomId];
        r.host = msg.sender;
        r.isSolo = isSolo;
        r.phase = Phase.Lobby;

        _addHuman(roomId, msg.sender);
        emit RoomCreated(roomId, msg.sender, isSolo);
    }

    /// @notice Tham gia phòng PvP (tối đa 5 người).
    function joinRoom(uint256 roomId) external inPhase(roomId, Phase.Lobby) {
        Room storage r = _rooms[roomId];
        require(r.host != address(0), "No such room");
        require(!r.isSolo, "Solo room");
        require(r.humanCount < MAX_PLAYERS, "Room full");
        require(_slotPlusOne[roomId][msg.sender] == 0, "Already joined");

        _addHuman(roomId, msg.sender);
    }

    /**
     * @notice Bắt đầu game: thêm Bot (Solo), chia vai trò MÃ HOÁ, cấp quyền giải mã.
     *
     * Chia vai trò (đúng 1 Impostor):
     *   impIdx = FHE.rem(FHE.randEuint8(128), n)            // slot Impostor, mã hoá
     *   role_i = FHE.select(FHE.eq(impIdx, i), 1, 0)        // mã hoá
     *   FHE.allow(role_i, wallet_i)                         // CHỈ ví i giải mã được
     *
     * Với Bot: handle chỉ `allowThis` -> chỉ contract dùng được (để bot hành động trong FHE).
     * `randEuint8(128)` rồi `rem n`: n=7 (Solo) lệch ~0.8% (chấp nhận được).
     */
    function startGame(uint256 roomId) external inPhase(roomId, Phase.Lobby) {
        Room storage r = _rooms[roomId];
        require(msg.sender == r.host, "Only host");

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
        r.taskTarget = (n - 1) * TASKS_PER_PLAYER; // (n-1) Crewmate; Impostor không đóng góp
        r.round = 1;

        // ── Chia vai trò ──
        euint8 impIdx = FHE.rem(FHE.randEuint8(128), n);
        Player[] storage ps = _players[roomId];
        for (uint8 i = 0; i < n; i++) {
            Player storage p = ps[i];

            ebool isImp = FHE.eq(impIdx, i);
            euint8 role = FHE.select(isImp, FHE.asEuint8(ROLE_IMPOSTOR), FHE.asEuint8(ROLE_CREW));
            p.role = role;
            FHE.allowThis(role); // contract cần dùng lại ở các tx sau
            if (!p.isBot) FHE.allow(role, p.wallet); // ← CHỈ chủ nhân thấy vai trò

            _setStatus(p, FHE.asEuint8(1)); // Alive
        }

        // ── Khởi tạo bộ đếm mã hoá ──
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
     * @notice Hành động "kill" ẩn. MỌI người chơi gọi 1 lần/round (Crewmate = no-op) để che vai trò.
     * @param encTarget  slotId nạn nhân, mã hoá phía client (externalEuint8)
     * @param inputProof ZK proof của input (fhevmjs/relayer-sdk tạo ra)
     *
     * canKill  = (role == Impostor) AND (status == Alive)                     [ebool]
     * hit_i    = canKill AND (target == i) AND (role_i == Crewmate)           [ebool]
     * status_i = select(hit_i, 0, status_i)
     * Không có revert nào phụ thuộc dữ liệu mã hoá.
     *
     * Solo: lượt của 6 Bot chạy riêng qua `runBotTurns` (chia lô BOTS_PER_TX Bot/tx).
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

        euint8 target = FHE.fromExternal(encTarget, inputProof); // xác thực proof + lấy handle
        ebool canKill = FHE.and(FHE.eq(me.role, ROLE_IMPOSTOR), FHE.eq(me.status, 1));
        _applyKill(ps, slot, canKill, target);

        emit Acted(roomId, r.round, slot);
    }

    /// @notice Hoàn thành 1 task. Chỉ Crewmate làm tăng tiến độ (mã hoá); Impostor "fake task".
    function completeTask(uint256 roomId) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        require(r.pendingKind == PendingKind.None, "Decryption pending");

        uint8 slot = _slotOf(roomId, msg.sender);
        Player storage me = _players[roomId][slot];
        require(me.tasksDone < TASKS_PER_PLAYER, "No tasks left"); // giới hạn giống nhau cho mọi vai trò
        me.tasksDone++;

        _addTask(r, me.role);
        emit TaskCompleted(roomId, slot);
    }

    /**
     * @notice Kiểm tra điều kiện thắng (Impostor thắng khi Crew sống <= Impostor sống; Crew thắng khi đủ task).
     *         Chỉ 2 bit kết quả được công khai, không lộ danh tính hay số lượng.
     *  Bước 1/2: hàm này. Bước 2/2: gọi `submitCheckpoint` với proof từ relayer.
     */
    function requestCheckpoint(uint256 roomId) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        _slotOf(roomId, msg.sender);
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

    /// @notice Bước 2/2 của checkpoint. `cleartexts` = abi.encode(bool impostorWins, bool tasksDone).
    function submitCheckpoint(
        uint256 roomId,
        bytes calldata cleartexts,
        bytes calldata decryptionProof
    ) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        require(r.pendingKind == PendingKind.Checkpoint, "No checkpoint pending");

        // Xác minh chữ ký KMS cho ĐÚNG các handle đã lưu (không cho caller tự chọn handle).
        FHE.checkSignatures(_pending[roomId], cleartexts, decryptionProof);
        delete _pending[roomId];
        r.pendingKind = PendingKind.None;

        (bool impWin, bool tasksDone) = abi.decode(cleartexts, (bool, bool));
        if (tasksDone) _finish(roomId, Winner.Crewmates);
        else if (impWin) _finish(roomId, Winner.Impostors);
    }

    // ═════════════════════════════════════════════════════════════════════
    //                         BOT (SOLO) — CHIA LÔ
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Solo: chạy lượt của Bot (làm task + Bot Impostor giết ngẫu nhiên), tối đa BOTS_PER_TX Bot mỗi giao dịch.
    ///         Client gọi lặp lại tới khi `pendingBotTurns` = 0 (mỗi round mỗi Bot chỉ chạy 1 lần).
    function runBotTurns(uint256 roomId) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        require(r.isSolo, "Solo only");
        _slotOf(roomId, msg.sender);
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

    /// @notice Solo: Bot bỏ phiếu ngẫu nhiên (mã hoá), tối đa BOTS_PER_TX Bot mỗi giao dịch. Phải xong hết trước `tallyVotes`.
    function runBotVotes(uint256 roomId) external inPhase(roomId, Phase.Voting) {
        Room storage r = _rooms[roomId];
        require(r.isSolo, "Solo only");
        _slotOf(roomId, msg.sender);

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

    /// @notice Số Bot chưa chạy lượt trong round hiện tại (0 nếu không phải Solo / không ở pha Playing).
    function pendingBotTurns(uint256 roomId) external view returns (uint8 n) {
        Room storage r = _rooms[roomId];
        if (!r.isSolo || r.phase != Phase.Playing) return 0;
        Player[] storage ps = _players[roomId];
        for (uint8 b = r.humanCount; b < r.totalSlots; b++) {
            if (ps[b].lastActRound < r.round) n++;
        }
    }

    /// @notice Số Bot chưa bỏ phiếu trong cuộc họp hiện tại (0 nếu không phải Solo / không ở pha Voting).
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

    /// @notice Mở cuộc họp: reset phiếu, và cấp quyền xem `status` của mọi slot cho người trong phòng (báo xác chết).
    function callMeeting(uint256 roomId) external inPhase(roomId, Phase.Playing) {
        Room storage r = _rooms[roomId];
        _slotOf(roomId, msg.sender);
        require(r.pendingKind == PendingKind.None, "Decryption pending");

        Player[] storage ps = _players[roomId];
        uint8 n = r.totalSlots;

        for (uint8 i = 0; i < n; i++) {
            r.voteCounts[i] = FHE.asEuint8(0);
            FHE.allowThis(r.voteCounts[i]);
            ps[i].hasVoted = false;

            // Cho cả phòng thấy ai còn sống / đã chết (chỉ người trong phòng, không công khai).
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
     * @notice Bỏ phiếu kín. `encVote` = slotId mục tiêu (hoặc giá trị >= totalSlots / 255 để skip).
     *
     * Với mỗi slot i:
     *   counts_i += select( (vote == i) AND (status_i == Alive), voterStatus, 0 )
     * - Phiếu của người đã chết có trọng số 0.
     * - Phiếu vào người đã chết bị bỏ qua.
     * - Không ai (kể cả validator) thấy phiếu của ai: chỉ có ciphertext.
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
     * @notice Kết thúc vote: tìm argmax mã hoá, loại người bị bầu, rồi yêu cầu giải mã công khai.
     *  Bước 1/2: hàm này. Bước 2/2: `finalizeTally` với proof từ relayer.
     *
     * Công khai (makePubliclyDecryptable) CHỈ 4 giá trị:
     *   [ejectedSlot (255 = không ai), ejectedRole, impostorWins, tasksDone]
     * Phiếu chi tiết từng người KHÔNG bao giờ được giải mã.
     * Hoà phiếu (hoặc không ai có phiếu) => không ai bị loại.
     */
    function tallyVotes(uint256 roomId) external inPhase(roomId, Phase.Voting) {
        Room storage r = _rooms[roomId];
        _slotOf(roomId, msg.sender);
        require(block.timestamp >= r.voteDeadline || r.votesCast == r.humanCount, "Voting still open");

        Player[] storage ps = _players[roomId];
        uint8 n = r.totalSlots;

        if (r.isSolo) {
            for (uint8 b = r.humanCount; b < n; b++) require(ps[b].hasVoted, "Bots must vote first");
        }

        // ── argmax mã hoá + phát hiện hoà ──
        euint8 maxV = FHE.asEuint8(0);
        euint8 idx = FHE.asEuint8(NO_TARGET);
        ebool tied = FHE.asEbool(false);
        for (uint8 i = 0; i < n; i++) {
            euint8 c = r.voteCounts[i];
            ebool gt = FHE.gt(c, maxV);
            ebool eqPos = FHE.and(FHE.eq(c, maxV), FHE.gt(c, 0));
            // gt và eqPos loại trừ nhau
            tied = FHE.or(FHE.and(tied, FHE.not(gt)), eqPos);
            maxV = FHE.select(gt, c, maxV);
            idx = FHE.select(gt, FHE.asEuint8(i), idx);
        }
        euint8 ejectIdx = FHE.select(tied, FHE.asEuint8(NO_TARGET), idx);

        // ── áp dụng loại người chơi lên status mã hoá + lấy role của người bị loại ──
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

    /// @notice Bước 2/2. `cleartexts` = abi.encode(uint8 ejectedSlot, uint8 ejectedRole, bool impostorWins, bool tasksDone).
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

        // Thứ tự ưu tiên: vote đúng Impostor > Impostor đủ quân > Crew đủ task
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
    //                               VIEWS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Handle vai trò của `player`. Chỉ ví `player` mới user-decrypt được (ACL), nên trả handle là an toàn.
    function getRoleHandle(uint256 roomId, address player) external view returns (euint8) {
        return _players[roomId][_slotOf(roomId, player)].role;
    }

    /// @notice Handle trạng thái sống/chết của 1 slot (decrypt được khi đã được cấp quyền: bản thân, hoặc sau callMeeting).
    function getStatusHandle(uint256 roomId, uint8 slotId) external view returns (euint8) {
        return _players[roomId][slotId].status;
    }

    function getPendingHandles(uint256 roomId) external view returns (bytes32[] memory) {
        return _pending[roomId];
    }

    function getSlotOf(uint256 roomId, address player) external view returns (uint8) {
        return _slotOf(roomId, player);
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
        emit PlayerJoined(roomId, who, slot);
    }

    function _slotOf(uint256 roomId, address who) private view returns (uint8) {
        uint8 s = _slotPlusOne[roomId][who];
        require(s != 0, "Not in room");
        return s - 1;
    }

    /// @dev Lưu status mới + cấp lại quyền (mỗi phép FHE tạo handle MỚI nên ACL phải cấp lại).
    function _setStatus(Player storage p, euint8 s) private {
        p.status = s;
        FHE.allowThis(s);
        if (!p.isBot) FHE.allow(s, p.wallet); // người chơi luôn xem được trạng thái của chính mình
    }

    function _applyKill(Player[] storage ps, uint8 killerSlot, ebool canKill, euint8 target) private {
        for (uint8 i = 0; i < ps.length; i++) {
            if (i == killerSlot) continue; // plaintext: không tự giết mình
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

    /// @dev Lượt của 1 Bot: làm task; Bot Impostor (nếu có) giết ngẫu nhiên.
    ///      Bot "AI" ở đây chỉ là ngẫu nhiên mã hoá: contract không biết bot nào là Impostor ở dạng plaintext.
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
     *      crewAlive = aliveTotal - impostorAlive,  impostorAlive = Σ role_i * status_i
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
        tasksDone = FHE.ge(r.taskProgress, r.taskTarget);
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
