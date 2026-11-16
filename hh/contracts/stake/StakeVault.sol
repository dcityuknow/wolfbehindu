// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984 } from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import { ILostIslandGame } from "../interfaces/ILostIslandGame.sol";
import { IStakeVaultGame, IStakeVaultModule } from "../interfaces/IStakeVault.sol";

/// @dev What the vault tells the leaderboard (encrypted winnings; the stats contract adds them up per wallet).
interface IStatsVault {
    function addEarnings(address who, euint64 amount) external;
}

/**
 * @title StakeVault
 * @notice Escrow for the encrypted ERC-7984 (cUSDT) stakes of PvP rooms. Players approve THIS contract as operator of their
 *         cUSDT; the game contract asks the vault to pull a stake when someone creates / joins a staked room.
 *
 *  ENCRYPTED: what each player really paid (0 if the transfer failed - no revert, so balances do not leak), the pot of each
 *  room and the total paid out as bounties. PUBLIC: the entry fee of a room (a room parameter) and - only when someone calls
 *  `revealPot` after the game - the final prize pool.
 *
 *  Money flow per room:  deposits -> pot  --bounties (BountyBoard, hidden)-->  players   --claimPayout-->  winners share the rest.
 *  Cancelled / aborted room: everyone pulls back their stake (minus an equal share of the bounties already paid out).
 */
contract StakeVault is ZamaEthereumConfig, IStakeVaultGame, IStakeVaultModule {
    IERC7984 public immutable token;
    address public immutable deployer;
    ILostIslandGame public game;
    IStatsVault public stats;
    bool public wired;
    mapping(address => bool) public isModule;

    mapping(uint256 => euint64) private _pot; // ENCRYPTED prize pool of a room
    mapping(uint256 => euint64) private _bountyOut; // ENCRYPTED total paid out as bounties
    mapping(uint256 => mapping(address => euint64)) private _paid; // ENCRYPTED amount a wallet really paid
    mapping(uint256 => mapping(address => bool)) public claimed; // payout or refund pulled

    event RoomOpened(uint256 indexed roomId);
    event Deposited(uint256 indexed roomId, address indexed who);
    event PayoutClaimed(uint256 indexed roomId, address indexed who);
    event RefundClaimed(uint256 indexed roomId, address indexed who);
    event BountyPaid(uint256 indexed roomId, address indexed to);
    event PotRevealed(uint256 indexed roomId, bytes32 potHandle);

    constructor(address token_) {
        token = IERC7984(token_);
        deployer = msg.sender;
    }

    /// @notice One-shot wiring (deployer only): the game, the leaderboard (may be 0) and the modules allowed to spend bounties.
    function wire(address game_, address stats_, address[] calldata modules) external {
        require(msg.sender == deployer, "Only deployer");
        require(!wired, "Already wired");
        wired = true;
        game = ILostIslandGame(game_);
        stats = IStatsVault(stats_);
        for (uint256 i = 0; i < modules.length; i++) isModule[modules[i]] = true;
    }

    modifier onlyGame() {
        require(msg.sender == address(game), "Only game");
        _;
    }

    // ───────────────────────────── called by the game ─────────────────────────────

    function openRoom(uint256 roomId) external onlyGame {
        _pot[roomId] = FHE.asEuint64(0);
        FHE.allowThis(_pot[roomId]);
        _bountyOut[roomId] = FHE.asEuint64(0);
        FHE.allowThis(_bountyOut[roomId]);
        emit RoomOpened(roomId);
    }

    /// @dev Pull the stake with an ENCRYPTED ERC-7984 transfer. If the player's balance is too low the token moves 0
    ///      instead of reverting (a revert would leak the balance), so we record what was REALLY paid, encrypted.
    function deposit(uint256 roomId, address who, uint64 stake) external onlyGame {
        euint64 amount = FHE.asEuint64(stake);
        FHE.allowTransient(amount, address(token));
        euint64 got = token.confidentialTransferFrom(who, address(this), amount);
        _paid[roomId][who] = got;
        FHE.allowThis(got);
        FHE.allow(got, who); // the player can always check what they paid
        _pot[roomId] = FHE.add(_pot[roomId], got);
        FHE.allowThis(_pot[roomId]);
        emit Deposited(roomId, who);
    }

    // ───────────────────────────── called by approved modules ─────────────────────────────

    /// @notice Pay a bounty out of the pot. Pays min(want, pot); `want` is already 0 for a player who is not an alive crewmate.
    function spendBounty(uint256 roomId, address to, euint64 want) external {
        require(isModule[msg.sender], "Not a module");
        euint64 pot = _pot[roomId];
        euint64 amt = FHE.select(FHE.ge(pot, want), want, FHE.asEuint64(0));
        _pot[roomId] = FHE.sub(pot, amt);
        FHE.allowThis(_pot[roomId]);
        _bountyOut[roomId] = FHE.add(_bountyOut[roomId], amt);
        FHE.allowThis(_bountyOut[roomId]);

        FHE.allowTransient(amt, address(token));
        euint64 sent = token.confidentialTransfer(to, amt);
        FHE.allow(sent, to); // the winner can see what arrived; nobody else can
        _tellStats(to, sent);
        emit BountyPaid(roomId, to);
    }

    // ───────────────────────────── called by players ─────────────────────────────

    /// @notice Settled PvP room: a winner pulls their equal share of the pot (encrypted transfer). A winner whose own
    ///         stake transfer had failed (balance too low) gets 0, so nobody can free-ride on the pot.
    function claimPayout(uint256 roomId) external {
        require(game.phaseOf(roomId) == 4, "Not finished"); // Phase.Finished
        (uint64 stake, bool settled, uint8 winnersCount, , ) = game.settlement(roomId);
        require(settled, "Not settled");
        uint8 slot = game.getSlotOf(roomId, msg.sender);
        require(game.isWinner(roomId, slot), "Not a winner");
        require(!claimed[roomId][msg.sender], "Already claimed");
        claimed[roomId][msg.sender] = true;

        euint64 share = FHE.div(_pot[roomId], uint64(winnersCount));
        euint64 amount = FHE.select(FHE.eq(_paid[roomId][msg.sender], stake), share, FHE.asEuint64(0));
        FHE.allowTransient(amount, address(token));
        euint64 sent = token.confidentialTransfer(msg.sender, amount);
        FHE.allow(sent, msg.sender);
        _tellStats(msg.sender, sent);
        emit PayoutClaimed(roomId, msg.sender);
    }

    /// @notice Cancelled / aborted room: each fully-paid player pulls back their stake minus an equal share of the bounties
    ///         that were already paid out of the pot (0 bounties -> exactly what they paid). A player whose own deposit
    ///         failed gets 0.
    function claimRefund(uint256 roomId) external {
        require(game.phaseOf(roomId) == 5, "Not cancelled"); // Phase.Cancelled
        (uint64 stake, , , uint8 humanCount, ) = game.settlement(roomId);
        game.getSlotOf(roomId, msg.sender); // reverts "Not in room"
        require(!claimed[roomId][msg.sender], "Already claimed");
        claimed[roomId][msg.sender] = true;

        // ceil(bountiesPaid / players): rounding UP keeps the sum of all refunds <= what the vault still holds (nobody gets stuck with 0)
        euint64 bountyShare = FHE.div(FHE.add(_bountyOut[roomId], uint64(humanCount - 1)), uint64(humanCount));
        euint64 back = FHE.sub(FHE.asEuint64(stake), bountyShare); // bounties are capped far below one stake: no underflow
        euint64 amount = FHE.select(FHE.eq(_paid[roomId][msg.sender], stake), back, FHE.asEuint64(0));
        FHE.allowTransient(amount, address(token));
        euint64 sent = token.confidentialTransfer(msg.sender, amount);
        FHE.allow(sent, msg.sender);
        emit RefundClaimed(roomId, msg.sender);
    }

    /// @notice After the game (finished or cancelled) anybody may make the final pot publicly decryptable: the prize pool
    ///         stays a secret for the whole game and is only revealed here.
    function revealPot(uint256 roomId) external returns (bytes32 handle) {
        uint8 ph = game.phaseOf(roomId);
        require(ph == 4 || ph == 5, "Game still running");
        FHE.makePubliclyDecryptable(_pot[roomId]);
        handle = FHE.toBytes32(_pot[roomId]);
        emit PotRevealed(roomId, handle);
    }

    // ───────────────────────────── views ─────────────────────────────

    /// @notice Handle of what `who` really paid (only `who` can decrypt it).
    function getPaidHandle(uint256 roomId, address who) external view returns (bytes32) {
        return FHE.toBytes32(_paid[roomId][who]);
    }

    /// @notice Handle of the pot. Useless until `revealPot` made it public.
    function getPotHandle(uint256 roomId) external view returns (bytes32) {
        return FHE.toBytes32(_pot[roomId]);
    }

    function _tellStats(address who, euint64 amount) private {
        address s = address(stats);
        if (s == address(0)) return;
        FHE.allowTransient(amount, s);
        try stats.addEarnings(who, amount) {} catch {}
    }
}
