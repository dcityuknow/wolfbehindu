// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { RoomModule } from "./core/RoomModule.sol";
import { PlayModule } from "./core/PlayModule.sol";
import { MeetingModule } from "./core/MeetingModule.sol";
import { SettlementModule } from "./core/SettlementModule.sol";
import { ModuleApi } from "./core/ModuleApi.sol";

/**
 * @title  SpaceImpostorFHE ("Lost Island")
 * @notice Social-deduction game (one hidden spy among a squad) on the Zama FHEVM, with optional encrypted
 *         ERC-7984 (cUSDT) stakes. Nothing that must stay secret is ever stored or emitted in clear.
 *
 *  This contract only COMPOSES the game modules (see ./core). Satellite contracts live next to it:
 *    stake/StakeVault.sol          escrow of the encrypted stakes, pot, payouts, refunds, bounty spending
 *    stats/LostIslandStats.sol     leaderboard (wins per role) + opt-in public encrypted earnings
 *    modules/BountyBoard.sol       secret personal tasks that pay a small cUSDT bounty out of the pot
 *    modules/LastWill.sol          a murdered player's encrypted last will (suspect + 32-char line)
 *    modules/BribeEscrow.sol       conditional encrypted bribes for a vote
 *    modules/RoomChat.sol          members-only table talk
 *
 * ENCRYPTED: every role (who the spy is), every alive/dead status, the spy's kill target, every vote,
 *            the task counter, and (staked rooms) every player's paid stake and the pot.
 * PUBLIC (only through the KMS: makePubliclyDecryptable -> relayer publicDecrypt -> FHE.checkSignatures):
 *            checkpoint win flags, vote result + ejected role, a player's own death proof, and - once the
 *            game is Finished - every role, so anyone can audit that the winner (and payout) was legitimate.
 *
 * NO DATA-DEPENDENT REVERTS: a secret condition (am I the spy? is the target alive?) is computed as `ebool`
 * and applied with `FHE.select`, so a transaction succeeds whether or not it had an effect. Otherwise a
 * revert (or its absence) would leak the role.
 *
 * RANDOMNESS: the spy is drawn with `FHE.randEuint8` inside the FHE coprocessor - nobody (not the host, not a
 * validator, not the contract) can predict or bias it - and the draw is publicly verifiable at game end.
 */
contract SpaceImpostorFHE is ZamaEthereumConfig, RoomModule, PlayModule, MeetingModule, SettlementModule, ModuleApi {}
