// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, ebool, externalEuint8 } from "@fhevm/solidity/lib/FHE.sol";
import "./GameStorage.sol";

/**
 * @title MeetingModule
 * @notice Meetings and shielded (encrypted) voting: ballots are `euint8`, only the elected slot / its role / the win flags
 *         are ever made public.
 */
abstract contract MeetingModule is GameStorage {
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
        // Keep the ciphertext ballot of this round: the BribeEscrow module can later compare it with a bribe's wish
        // INSIDE the FHE coprocessor, so the vote itself is never revealed.
        _ballots[roomId][r.round][slot] = vote;
        FHE.allowThis(vote);
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
}
