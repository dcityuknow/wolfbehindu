// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { FHE, euint8, euint64, externalEuint8, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { ILostIslandGame } from "../interfaces/ILostIslandGame.sol";

/**
 * @title LastWill
 * @notice The encrypted last will of a murdered player. It can only be written by a player whose DEATH WAS PROVEN on-chain
 *         (KMS-signed `submitDeathProof`, which sets `isAssassinated`) - never by a player voted out. It holds:
 *           - `suspect`: the slot the victim blames (euint8, encrypted)
 *           - `text`: a 32-character line packed into 4 x euint64 (8 ASCII bytes each, encrypted)
 *         Only the members of the room can decrypt it (ACL), so it surfaces at the table exactly when it can still flip the vote.
 */
contract LastWill is ZamaEthereumConfig {
    ILostIslandGame public immutable game;

    struct Will {
        bool written;
        euint8 suspect;
        euint64[4] text;
    }
    mapping(uint256 => mapping(uint8 => Will)) private _wills;

    /// @dev Public: THAT a will exists, never what it says.
    event WillWritten(uint256 indexed roomId, uint8 slotId);

    constructor(address game_) {
        game = ILostIslandGame(game_);
    }

    function writeWill(
        uint256 roomId,
        externalEuint8 encSuspect,
        externalEuint64 t0,
        externalEuint64 t1,
        externalEuint64 t2,
        externalEuint64 t3,
        bytes calldata inputProof
    ) external {
        uint8 slot = game.getSlotOf(roomId, msg.sender); // reverts if not in the room
        require(game.isAssassinated(roomId, slot), "Only a proven murder victim");
        uint8 ph = game.phaseOf(roomId);
        require(ph == 1 || ph == 2, "Game not running"); // Playing or Voting
        Will storage w = _wills[roomId][slot];
        require(!w.written, "Will already written");
        w.written = true;

        (address[] memory wallets, , ) = game.getPlayers(roomId);

        w.suspect = FHE.fromExternal(encSuspect, inputProof);
        _share8(w.suspect, wallets);
        w.text[0] = FHE.fromExternal(t0, inputProof);
        w.text[1] = FHE.fromExternal(t1, inputProof);
        w.text[2] = FHE.fromExternal(t2, inputProof);
        w.text[3] = FHE.fromExternal(t3, inputProof);
        for (uint256 i = 0; i < 4; i++) _share64(w.text[i], wallets);

        emit WillWritten(roomId, slot);
    }

    /// @notice Handles of a will; only the members of the room can user-decrypt them.
    function readWill(
        uint256 roomId,
        uint8 slotId
    ) external view returns (bool written, bytes32 suspect, bytes32[4] memory text) {
        Will storage w = _wills[roomId][slotId];
        written = w.written;
        if (!written) return (false, bytes32(0), text);
        suspect = FHE.toBytes32(w.suspect);
        for (uint256 i = 0; i < 4; i++) text[i] = FHE.toBytes32(w.text[i]);
    }

    function _share8(euint8 v, address[] memory wallets) private {
        FHE.allowThis(v);
        for (uint256 i = 0; i < wallets.length; i++) {
            if (wallets[i] != address(0)) FHE.allow(v, wallets[i]);
        }
    }

    function _share64(euint64 v, address[] memory wallets) private {
        FHE.allowThis(v);
        for (uint256 i = 0; i < wallets.length; i++) {
            if (wallets[i] != address(0)) FHE.allow(v, wallets[i]);
        }
    }
}
