// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8 } from "@fhevm/solidity/lib/FHE.sol";
import "./GameStorage.sol";
import { IStatsGame } from "../interfaces/ILostIslandGame.sol";

/**
 * @title SettlementModule
 * @notice End of a game: cancelling / aborting staked rooms, unlocking the roles for audit, verifying them on-chain
 *         (`settleRoom`) to fix the winning side, and the read-only views the UI needs. Money itself lives in the StakeVault.
 */
abstract contract SettlementModule is GameStorage {
    // ═════════════════════════════════════════════════════════════════════
    //                     CANCEL / ABORT (staked rooms)
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


    // ═════════════════════════════════════════════════════════════════════
    //                     SETTLEMENT (winners are fixed on-chain)
    // ═════════════════════════════════════════════════════════════════════

    /**
     * @notice Finished PvP room (free or staked), step 2 after `revealRoles`: verifies the KMS-signed cleartext roles of EVERY
     *         slot against the stored handles (so nobody can claim a role that was not dealt), fixes the winning side and
     *         reports the game to the leaderboard. Staked rooms then pay out from the StakeVault (`claimPayout`).
     *         `cleartexts` is the relayer's abiEncodedClearValues: one 32-byte word per role, in slot order.
     */
    function settleRoom(
        uint256 roomId,
        bytes calldata cleartexts,
        bytes calldata decryptionProof
    ) external inPhase(roomId, Phase.Finished) {
        Room storage r = _rooms[roomId];
        require(!r.isSolo, "Solo room");
        require(!r.settled, "Already settled");
        bytes32[] storage hs = _roleHandles[roomId];
        require(hs.length == r.totalSlots, "Call revealRoles first");
        require(cleartexts.length == hs.length * 32, "Bad cleartexts");
        FHE.checkSignatures(hs, cleartexts, decryptionProof);

        // Crewmates win -> every crewmate (role 0) is a winner; Impostors win -> the spy (role 1). Dead or alive.
        require(r.winner == Winner.Crewmates || r.winner == Winner.Impostors, "No settled winner");
        uint8 wantRole = r.winner == Winner.Impostors ? ROLE_IMPOSTOR : ROLE_CREW;
        uint8 n = uint8(hs.length);
        uint8[] memory roles = new uint8[](n);
        uint8 count;
        for (uint8 i = 0; i < n; i++) {
            uint8 role = uint8(uint256(bytes32(cleartexts[i * 32:(i + 1) * 32])));
            roles[i] = role;
            if (role == wantRole) {
                _isWinner[roomId][i] = true;
                count++;
            }
        }
        require(count > 0, "No winners");
        r.winnersCount = count;
        r.settled = true;
        emit StakeSettled(roomId, count);
        _recordStats(roomId, roles, wantRole, r.stake > 0);
    }

    /// @dev Best effort: a broken leaderboard must never block a payout.
    function _recordStats(uint256 roomId, uint8[] memory roles, uint8 winnerRole, bool staked) private {
        address s = stats;
        if (s == address(0)) return;
        Player[] storage ps = _players[roomId];
        address[] memory wallets = new address[](ps.length);
        for (uint256 i = 0; i < ps.length; i++) wallets[i] = ps[i].wallet;
        try IStatsGame(s).recordGame(roomId, wallets, roles, winnerRole, staked) {} catch {}
    }

    function getStakeInfo(uint256 roomId) external view returns (uint64 stake, bool settled, uint8 winnersCount) {
        Room storage r = _rooms[roomId];
        return (r.stake, r.settled, r.winnersCount);
    }

    function isWinner(uint256 roomId, uint8 slotId) external view returns (bool) {
        return _isWinner[roomId][slotId];
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
}
