// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, euint64, ebool, externalEuint8, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984 } from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import { ILostIslandGame } from "../interfaces/ILostIslandGame.sol";

/**
 * @title BribeEscrow
 * @notice Conditional, encrypted bribes during a meeting. A briber locks an ENCRYPTED amount of their own cUSDT (they approve
 *         this contract as ERC-7984 operator) together with an ENCRYPTED wish (the slot they want the target to vote for).
 *         The target can read the offer (ACL) and, once that meeting is over, claim it: the escrow asks the game - inside FHE - whether
 *         the target's stored encrypted ballot equals the wish, and pays the amount ONLY if it does. Neither the amount, the wish nor
 *         the ballot is ever revealed to the chain. The briber pulls back whatever was not paid (after the claim, or after a day if
 *         the target never claims). It is a deal between two players: the contract just keeps both sides honest.
 */
contract BribeEscrow is ZamaEthereumConfig {
    uint64 public constant RECLAIM_AFTER = 1 days;
    uint8 public constant MAX_OFFERS = 24;

    ILostIslandGame public immutable game;
    IERC7984 public immutable token;

    struct Offer {
        address briber;
        address target;
        uint8 targetSlot;
        uint32 round;
        uint64 createdAt;
        bool claimed;
        bool reclaimed;
        euint8 wanted; // slot the briber wants the target to vote for (ENCRYPTED)
        euint64 remaining; // locked amount not yet paid out (ENCRYPTED)
    }
    mapping(uint256 => Offer[]) private _offers;

    event BribeOffered(uint256 indexed roomId, uint256 indexed offerId, address indexed target);
    event BribeClaimed(uint256 indexed roomId, uint256 indexed offerId);
    event BribeReclaimed(uint256 indexed roomId, uint256 indexed offerId);

    constructor(address game_, address token_) {
        game = ILostIslandGame(game_);
        token = IERC7984(token_);
    }

    function offerBribe(
        uint256 roomId,
        address target,
        externalEuint8 encWanted,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external returns (uint256 offerId) {
        require(game.phaseOf(roomId) == 2, "No meeting open"); // Voting
        require(block.timestamp < game.voteDeadlineOf(roomId), "Voting closed");
        game.getSlotOf(roomId, msg.sender);
        uint8 tSlot = game.getSlotOf(roomId, target);
        require(target != msg.sender, "Cannot bribe yourself");
        require(_offers[roomId].length < MAX_OFFERS, "Too many offers");

        euint64 amt = FHE.fromExternal(encAmount, inputProof);
        FHE.allowTransient(amt, address(token));
        euint64 got = token.confidentialTransferFrom(msg.sender, address(this), amt); // 0 if the briber cannot afford it
        euint8 wanted = FHE.fromExternal(encWanted, inputProof);

        Offer storage o = _offers[roomId].push();
        o.briber = msg.sender;
        o.target = target;
        o.targetSlot = tSlot;
        o.round = game.roundOf(roomId);
        o.createdAt = uint64(block.timestamp);
        o.wanted = wanted;
        o.remaining = got;
        FHE.allowThis(wanted);
        FHE.allowThis(got);
        FHE.allow(wanted, target); // the target learns what is asked and how much is offered - nobody else does
        FHE.allow(got, target);
        FHE.allow(got, msg.sender);

        offerId = _offers[roomId].length - 1;
        emit BribeOffered(roomId, offerId, target);
    }

    /// @notice The target claims after the meeting of the offer's round is over. Paid only if their ballot matched the wish.
    function claimBribe(uint256 roomId, uint256 offerId) external {
        Offer storage o = _offers[roomId][offerId];
        require(msg.sender == o.target, "Not the target");
        require(!o.claimed && !o.reclaimed, "Closed");
        require(!(game.roundOf(roomId) == o.round && game.phaseOf(roomId) == 2), "Voting still open");
        o.claimed = true;

        FHE.allowTransient(o.wanted, address(game));
        ebool ok = game.ballotMatches(roomId, o.round, o.targetSlot, o.wanted);
        euint64 pay = FHE.select(ok, o.remaining, FHE.asEuint64(0));
        o.remaining = FHE.sub(o.remaining, pay);
        FHE.allowThis(o.remaining);
        FHE.allow(o.remaining, o.briber);

        FHE.allowTransient(pay, address(token));
        euint64 sent = token.confidentialTransfer(msg.sender, pay);
        FHE.allow(sent, msg.sender);
        emit BribeClaimed(roomId, offerId);
    }

    /// @notice The briber pulls back what was not paid: after the claim, or after RECLAIM_AFTER if the target never claimed.
    function reclaim(uint256 roomId, uint256 offerId) external {
        Offer storage o = _offers[roomId][offerId];
        require(msg.sender == o.briber, "Not the briber");
        require(!o.reclaimed, "Already reclaimed");
        require(o.claimed || block.timestamp >= uint256(o.createdAt) + RECLAIM_AFTER, "Not yet");
        o.reclaimed = true;

        FHE.allowTransient(o.remaining, address(token));
        euint64 sent = token.confidentialTransfer(msg.sender, o.remaining);
        FHE.allow(sent, msg.sender);
        emit BribeReclaimed(roomId, offerId);
    }

    // ───────────────────────────── views ─────────────────────────────

    function offerCount(uint256 roomId) external view returns (uint256) {
        return _offers[roomId].length;
    }

    /// @notice Public parts of an offer + the handles only the briber / target can decrypt.
    function offerInfo(
        uint256 roomId,
        uint256 offerId
    )
        external
        view
        returns (
            address briber,
            address target,
            uint8 targetSlot,
            uint32 round,
            uint64 createdAt,
            bool claimed,
            bool reclaimed,
            bytes32 wantedHandle,
            bytes32 remainingHandle
        )
    {
        Offer storage o = _offers[roomId][offerId];
        return (
            o.briber,
            o.target,
            o.targetSlot,
            o.round,
            o.createdAt,
            o.claimed,
            o.reclaimed,
            FHE.toBytes32(o.wanted),
            FHE.toBytes32(o.remaining)
        );
    }
}
