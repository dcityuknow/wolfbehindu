// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { euint64 } from "@fhevm/solidity/lib/FHE.sol";

/// @notice What the game contract calls on the vault.
interface IStakeVaultGame {
    function openRoom(uint256 roomId) external;
    function deposit(uint256 roomId, address who, uint64 stake) external;
}

/// @notice What an approved module (BountyBoard) calls on the vault.
interface IStakeVaultModule {
    /// @dev `want` must be allowed to the vault (FHE.allowTransient). The vault pays min(want, pot) and tells the stats contract.
    function spendBounty(uint256 roomId, address to, euint64 want) external;
}
