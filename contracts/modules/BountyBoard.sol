// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { ILostIslandGame } from "../interfaces/ILostIslandGame.sol";
import { IStakeVaultModule } from "../interfaces/IStakeVault.sol";

/**
 * @title BountyBoard
 * @notice Secret personal side-quests for STAKED rooms. Each player draws one encrypted task kind (only they can read it), does it
 *         in the world and then claims a bounty of stake/10 paid by the StakeVault out of the shared pot, in the middle of the game.
 *         The reward is multiplied by an encrypted "alive crewmate" flag, so a spy (or a dead player) can claim too and simply receives
 *         0: the claim never reverts and never reveals the role. Whether a task was really done is client-attested (as for the main
 *         tasks: the chain has no positions), but each wallet can claim once, only while the game runs, and only from the pot.
 */
contract BountyBoard is ZamaEthereumConfig {
    uint8 public constant TASK_KINDS = 6;
    uint64 public constant BOUNTY_DIVISOR = 10; // bounty = stake / 10 (<= 6 claims: at most 60% of ONE stake leaves a pot of >= 3 stakes)

    ILostIslandGame public immutable game;
    IStakeVaultModule public immutable vault;

    mapping(uint256 => mapping(address => euint8)) private _task;
    mapping(uint256 => mapping(address => bool)) public assigned;
    mapping(uint256 => mapping(address => bool)) public claimedBy;

    event TaskAssigned(uint256 indexed roomId, address indexed who);
    /// @dev Identical for everybody: it does not say whether any money moved.
    event BountyClaimed(uint256 indexed roomId, address indexed who);

    constructor(address game_, address vault_) {
        game = ILostIslandGame(game_);
        vault = IStakeVaultModule(vault_);
    }

    /// @notice Draw your secret task kind (0..TASK_KINDS-1, encrypted, random inside the coprocessor).
    function assignTask(uint256 roomId) external {
        game.getSlotOf(roomId, msg.sender); // member of the room
        (uint64 stake, , , , ) = game.settlement(roomId);
        require(stake > 0, "Not a staked room");
        require(game.phaseOf(roomId) == 1, "Game not running"); // Playing
        require(!assigned[roomId][msg.sender], "Already assigned");
        assigned[roomId][msg.sender] = true;

        euint8 t = FHE.rem(FHE.randEuint8(128), TASK_KINDS);
        _task[roomId][msg.sender] = t;
        FHE.allowThis(t);
        FHE.allow(t, msg.sender);
        emit TaskAssigned(roomId, msg.sender);
    }

    /// @notice Claim the bounty of your secret task (once). Pays 0, silently, unless you are an alive crewmate.
    function claimBounty(uint256 roomId) external {
        require(assigned[roomId][msg.sender], "No task assigned");
        require(!claimedBy[roomId][msg.sender], "Already claimed");
        uint8 ph = game.phaseOf(roomId);
        require(ph == 1 || ph == 2, "Game not running"); // Playing or Voting
        (uint64 stake, , , , ) = game.settlement(roomId);
        claimedBy[roomId][msg.sender] = true;

        ebool eligible = game.crewAliveFlag(roomId, msg.sender);
        euint64 want = FHE.select(eligible, FHE.asEuint64(stake / BOUNTY_DIVISOR), FHE.asEuint64(0));
        FHE.allowTransient(want, address(vault));
        vault.spendBounty(roomId, msg.sender, want);
        emit BountyClaimed(roomId, msg.sender);
    }

    /// @notice Handle of `who`'s secret task kind (only `who` can decrypt it).
    function taskHandle(uint256 roomId, address who) external view returns (bytes32) {
        return FHE.toBytes32(_task[roomId][who]);
    }
}
