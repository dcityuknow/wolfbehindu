// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title LostIslandStats
 * @notice Leaderboard of the PvP games.
 *
 *  PUBLIC (plain counters, derived from the KMS-verified roles the game contract checked in `settleRoom`):
 *     games played, games & wins as Crewmate ("great detective"), games & wins as Impostor ("night assassin"), staked wins.
 *  ENCRYPTED: the cUSDT a wallet won (payouts + bounties). Nobody sees it - not even this contract - unless the wallet owner
 *     chooses to `publishEarnings()`: that makes THEIR running total publicly decryptable (a snapshot), so they can appear
 *     on the cUSDT board. The wallet can always decrypt its own total privately.
 */
contract LostIslandStats is ZamaEthereumConfig {
    struct Record {
        uint32 games;
        uint32 crewGames;
        uint32 crewWins;
        uint32 impGames;
        uint32 impWins;
        uint32 stakedWins;
    }

    address public immutable deployer;
    address public game;
    address public vault;
    bool public wired;

    mapping(address => Record) private _rec;
    address[] private _players;
    mapping(address => bool) private _known;
    mapping(uint256 => bool) public recorded;

    mapping(address => euint64) private _earned; // ENCRYPTED winnings
    mapping(address => bytes32) public publishedEarnings; // handle of a snapshot the wallet made public (0 = never published)

    event GameRecorded(uint256 indexed roomId, uint8 players, uint8 winnerRole);
    event EarningsPublished(address indexed who, bytes32 handle);

    constructor() {
        deployer = msg.sender;
    }

    function wire(address game_, address vault_) external {
        require(msg.sender == deployer, "Only deployer");
        require(!wired, "Already wired");
        wired = true;
        game = game_;
        vault = vault_;
    }

    // ───────────────────────────── writes (game / vault only) ─────────────────────────────

    function recordGame(
        uint256 roomId,
        address[] calldata players,
        uint8[] calldata roles,
        uint8 winnerRole,
        bool staked
    ) external {
        require(msg.sender == game, "Only game");
        require(!recorded[roomId], "Already recorded");
        require(players.length == roles.length, "Length mismatch");
        recorded[roomId] = true;
        for (uint256 i = 0; i < players.length; i++) {
            address p = players[i];
            if (p == address(0)) continue;
            if (!_known[p]) {
                _known[p] = true;
                _players.push(p);
            }
            Record storage r = _rec[p];
            r.games++;
            bool won = roles[i] == winnerRole;
            if (roles[i] == 1) {
                r.impGames++;
                if (won) r.impWins++;
            } else {
                r.crewGames++;
                if (won) r.crewWins++;
            }
            if (won && staked) r.stakedWins++;
        }
        emit GameRecorded(roomId, uint8(players.length), winnerRole);
    }

    /// @notice `amount` must be allowed to this contract (FHE.allowTransient by the vault).
    function addEarnings(address who, euint64 amount) external {
        require(msg.sender == vault, "Only vault");
        if (!_known[who]) {
            _known[who] = true;
            _players.push(who);
        }
        euint64 cur = _earned[who];
        euint64 next = FHE.isInitialized(cur) ? FHE.add(cur, amount) : amount;
        _earned[who] = next;
        FHE.allowThis(next);
        FHE.allow(next, who); // the wallet reads its own total
    }

    // ───────────────────────────── opt-in publication ─────────────────────────────

    /// @notice Make your CURRENT encrypted winnings total publicly decryptable (so you can show up on the cUSDT board).
    function publishEarnings() external {
        euint64 cur = _earned[msg.sender];
        require(FHE.isInitialized(cur), "No winnings yet");
        FHE.makePubliclyDecryptable(cur);
        bytes32 h = FHE.toBytes32(cur);
        publishedEarnings[msg.sender] = h;
        emit EarningsPublished(msg.sender, h);
    }

    /// @notice Handle of `who`'s private winnings total (only `who` can user-decrypt it).
    function earningsHandle(address who) external view returns (bytes32) {
        return FHE.toBytes32(_earned[who]);
    }

    // ───────────────────────────── views ─────────────────────────────

    function playersCount() external view returns (uint256) {
        return _players.length;
    }

    function recordOf(address who) external view returns (Record memory) {
        return _rec[who];
    }

    /// @notice A page of the board: wallets, their counters and the handle of their published earnings snapshot (or 0).
    function page(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory wallets, Record[] memory records, bytes32[] memory earnings) {
        uint256 total = _players.length;
        uint256 end = offset + limit > total ? total : offset + limit;
        uint256 n = end > offset ? end - offset : 0;
        wallets = new address[](n);
        records = new Record[](n);
        earnings = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            address p = _players[offset + i];
            wallets[i] = p;
            records[i] = _rec[p];
            earnings[i] = publishedEarnings[p];
        }
    }
}
