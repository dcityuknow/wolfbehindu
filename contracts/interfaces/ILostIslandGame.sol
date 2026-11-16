// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { ebool, euint8 } from "@fhevm/solidity/lib/FHE.sol";

/// @notice The slice of the game contract that the satellite contracts (vault, stats, modules) rely on.
interface ILostIslandGame {
    // ── plain views ──
    function getSlotOf(uint256 roomId, address player) external view returns (uint8); // reverts "Not in room"
    function phaseOf(uint256 roomId) external view returns (uint8); // Phase enum as uint8
    function roundOf(uint256 roomId) external view returns (uint32);
    function voteDeadlineOf(uint256 roomId) external view returns (uint64);
    function isWinner(uint256 roomId, uint8 slotId) external view returns (bool);
    function isAssassinated(uint256 roomId, uint8 slotId) external view returns (bool);
    function settlement(
        uint256 roomId
    ) external view returns (uint64 stake, bool settled, uint8 winnersCount, uint8 humanCount, bool isSolo);
    function getPlayers(
        uint256 roomId
    ) external view returns (address[] memory wallets, bool[] memory isBot, bool[] memory ejected);

    // ── hooks that only an approved module may call (they hand back an ebool allowed to the caller) ──
    function crewAliveFlag(uint256 roomId, address who) external returns (ebool);
    function ballotMatches(uint256 roomId, uint32 round, uint8 slotId, euint8 wanted) external returns (ebool);
}

/// @notice What the game calls on the stats contract after a PvP game was settled.
interface IStatsGame {
    function recordGame(uint256 roomId, address[] calldata players, uint8[] calldata roles, uint8 winnerRole, bool staked) external;
}
