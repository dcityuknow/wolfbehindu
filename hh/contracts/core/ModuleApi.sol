// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, ebool } from "@fhevm/solidity/lib/FHE.sol";
import "./GameStorage.sol";

/**
 * @title ModuleApi
 * @notice The narrow surface the satellite contracts use: one-shot wiring (`configure`), a few plain views and two hooks that
 *         only approved modules may call. A hook computes an ENCRYPTED yes/no inside the FHE coprocessor and hands the
 *         resulting `ebool` to the calling module with `allowTransient`, so no role / ballot is ever revealed to it.
 */
abstract contract ModuleApi is GameStorage {
    /// @notice One-shot wiring done by the deployer right after all contracts exist.
    function configure(address vault_, address stats_, address[] calldata modules) external {
        require(msg.sender == deployer, "Only deployer");
        require(!configured, "Already configured");
        configured = true;
        vault = vault_;
        stats = stats_;
        for (uint256 i = 0; i < modules.length; i++) isModule[modules[i]] = true;
        emit GameConfigured(vault_, stats_);
    }

    // ───────────────────────────── plain views for the satellites ─────────────────────────────

    function phaseOf(uint256 roomId) external view returns (uint8) {
        return uint8(_rooms[roomId].phase);
    }

    function roundOf(uint256 roomId) external view returns (uint32) {
        return _rooms[roomId].round;
    }

    function voteDeadlineOf(uint256 roomId) external view returns (uint64) {
        return _rooms[roomId].voteDeadline;
    }

    function isAssassinated(uint256 roomId, uint8 slotId) external view returns (bool) {
        return _players[roomId][slotId].assassinated;
    }

    function settlement(
        uint256 roomId
    ) external view returns (uint64 stake, bool settled, uint8 winnersCount, uint8 humanCount, bool isSolo) {
        Room storage r = _rooms[roomId];
        return (r.stake, r.settled, r.winnersCount, r.humanCount, r.isSolo);
    }

    // ───────────────────────────── module-only FHE hooks ─────────────────────────────

    /// @notice Encrypted "is `who` an ALIVE CREWMATE?" - the BountyBoard multiplies a reward by it, so the spy (or a dead
    ///         player) who claims simply receives 0 and nothing about the role leaks (no revert, same events).
    function crewAliveFlag(uint256 roomId, address who) external onlyModule returns (ebool flag) {
        Player storage p = _players[roomId][_slotOf(roomId, who)];
        flag = FHE.and(FHE.eq(p.role, ROLE_CREW), FHE.eq(p.status, 1));
        FHE.allowTransient(flag, msg.sender);
    }

    /// @notice Encrypted "did the voter of `slotId` cast exactly `wanted` in meeting round `round`?" (false if no ballot).
    ///         `wanted` must have been allowed to this contract by the caller (FHE.allowTransient).
    function ballotMatches(
        uint256 roomId,
        uint32 round,
        uint8 slotId,
        euint8 wanted
    ) external onlyModule returns (ebool ok) {
        euint8 b = _ballots[roomId][round][slotId];
        if (FHE.isInitialized(b)) {
            ok = FHE.eq(b, wanted);
        } else {
            ok = FHE.asEbool(false);
        }
        FHE.allowTransient(ok, msg.sender);
    }
}
