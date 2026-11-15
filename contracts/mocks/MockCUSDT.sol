// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { ERC7984 } from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @notice TEST-ONLY confidential token (ERC-7984) used by the Hardhat tests. Production uses the official cUSDT.
contract MockCUSDT is ZamaEthereumConfig, ERC7984 {
    constructor() ERC7984("Mock cUSDT", "cUSDT", "") {}

    function mint(address to, uint64 amount) external {
        euint64 a = FHE.asEuint64(amount);
        _mint(to, a);
    }
}
