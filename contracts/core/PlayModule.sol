// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, ebool, externalEuint8 } from "@fhevm/solidity/lib/FHE.sol";
import "./GameStorage.sol";

/**
 * @title PlayModule
 * @notice The running game: secret kills, tasks, checkpoints (win detection), friendly fire, verifiable death proofs
 *         and the batched solo bots.
 */
abstract contract PlayModule is GameStorage {
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
     * Solo: the 10 bots run separately via `runBotTurns` (batches of BOTS_PER_TX bots per tx).
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
        _players[roomId][slot].assassinated = true;
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
}
