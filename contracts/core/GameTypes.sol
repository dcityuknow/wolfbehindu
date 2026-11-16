// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import { euint8 } from "@fhevm/solidity/lib/FHE.sol";

/// @dev Number of slots in a room (humans + bots). File-level so the Room struct can size its encrypted vote counters.
uint8 constant MAX_SLOTS = 7;

enum Phase {
    Lobby,
    Playing,
    Voting,
    Tallying, // waiting for the KMS-signed public decryption of the vote result
    Finished,
    Cancelled // staked room that never finished: every player can claim a refund
}

enum Winner {
    None,
    Crewmates,
    Impostors,
    FriendlyFire // the squad executed a player after friendly fire: mission over, the spy was never found
}

enum PendingKind {
    None,
    Checkpoint,
    Tally,
    Death // proof that the caller's own (encrypted) status is Dead
}

struct Player {
    address wallet; // address(0) for a bot
    bool isBot;
    bool hasVoted; // plaintext: voted this round (leaks nothing about the role)
    bool ejected; // plaintext: removed by vote or proven dead (already public)
    bool assassinated; // plaintext: proven dead by a KMS-signed death proof (a kill victim, never a vote-ejected player)
    uint8 tasksDone; // plaintext; same cap for every role
    uint32 lastActRound; // last round in which executeSecretKill / the bot turn ran
    euint8 role; // 0 = Crewmate, 1 = Impostor   (ENCRYPTED)
    euint8 status; // 1 = Alive,    0 = Dead       (ENCRYPTED)
}

struct Room {
    address host;
    bool isSolo;
    bool isPublic; // listed for Quick Match (any member may start it after PUBLIC_AUTOSTART_DELAY)
    Phase phase;
    Winner winner;
    PendingKind pendingKind;
    uint8 humanCount;
    uint8 totalSlots; // humans + bots
    uint8 taskTarget; // total crew tasks needed to win
    uint8 votesCast;
    uint32 round;
    uint32 lastCheckpointRound;
    uint64 voteDeadline;
    address operator; // Solo: session wallet allowed to run the bots / tally / checkpoint (no MetaMask popups)
    uint64 stake; // staked rooms: public entry fee per player (cUSDT base units). 0 = free room. Balances stay encrypted (StakeVault).
    uint64 createdAt;
    uint64 startedAt;
    uint8 winnersCount; // set by settleRoom: size of the winning side (all of its members, dead or alive)
    bool settled; // roles verified on-chain, winners fixed (payouts can then be claimed from the StakeVault)
    euint8 taskProgress; // tasks completed (ENCRYPTED; the spy never adds)
    euint8[MAX_SLOTS] voteCounts; // votes accumulated per slot (ENCRYPTED)
}
