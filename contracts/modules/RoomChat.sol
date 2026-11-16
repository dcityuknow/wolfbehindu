// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { ILostIslandGame } from "../interfaces/ILostIslandGame.sol";

/// @title RoomChat
/// @notice Members-only table talk for a PvP room (lobby, game, meeting, counting). Messages are plain events: cheap, and they are
///         exactly what people say out loud at a table. Secrets (roles, votes, wills) never go through here.
contract RoomChat {
    uint16 public constant MAX_LEN = 160;
    ILostIslandGame public immutable game;

    event Message(uint256 indexed roomId, address indexed from, uint8 slotId, string text);

    constructor(address game_) {
        game = ILostIslandGame(game_);
    }

    function say(uint256 roomId, string calldata text) external {
        uint8 slot = game.getSlotOf(roomId, msg.sender); // reverts "Not in room"
        uint256 len = bytes(text).length;
        require(len > 0 && len <= MAX_LEN, "Bad length");
        require(game.phaseOf(roomId) <= 3, "Game is over"); // Lobby .. Tallying
        emit Message(roomId, msg.sender, slot, text);
    }
}
