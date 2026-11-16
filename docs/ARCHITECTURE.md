# Contract architecture (v5)

The single 1000-line contract was split into **focused modules** (one file = one concern) and **separately deployed satellites**.
Splitting into inherited modules alone would not shrink the bytecode (the EVM limit is per deployed contract, 24,576 bytes),
so everything that is not core game logic became its own contract.

```
contracts/
├─ SpaceImpostorFHE.sol          the game: only composes the modules below
├─ core/                         (inherited, ONE deployed contract)
│   ├─ GameTypes.sol             enums, structs, constants
│   ├─ GameStorage.sol           storage, events, access control, shared FHE helpers
│   ├─ RoomModule.sol            free / staked / public rooms, joining, encrypted role deal, Quick Match listing
│   ├─ PlayModule.sol            secret kill, tasks, checkpoint, friendly fire, death proofs, solo bots
│   ├─ MeetingModule.sol         meetings, encrypted ballots (kept per round), tally
│   ├─ SettlementModule.sol      cancel/abort, role reveal, settleRoom (KMS-verified winners), views
│   └─ ModuleApi.sol             one-shot wiring + the two FHE hooks satellites may call
├─ stake/StakeVault.sol          escrow of encrypted cUSDT stakes, pot, payouts, refunds, bounty spending, pot reveal
├─ stats/LostIslandStats.sol     leaderboard + opt-in public encrypted earnings
├─ modules/BountyBoard.sol       secret personal tasks paid from the pot
├─ modules/LastWill.sol          encrypted last will of a proven murder victim
├─ modules/BribeEscrow.sol       conditional encrypted bribes, verified inside FHE
├─ modules/RoomChat.sol          members-only table talk
├─ interfaces/                   ILostIslandGame, IStakeVault (the narrow surfaces between contracts)
└─ mocks/MockCUSDT.sol           tests only
```

## How the satellites touch secrets without seeing them
* The game never hands out a role or a ballot. A module calls a **hook** (`crewAliveFlag`, `ballotMatches`); the game computes an
  encrypted `ebool` and gives it back with `FHE.allowTransient`. The module multiplies a payment by it.
* Hooks are callable only by addresses the deployer registered once (`configure`). Vault / stats / modules each accept one wiring call.

## Money flow (staked room)
`join` → vault pulls stake (encrypted transfer) → `pot` · `BountyBoard.claimBounty` → vault pays min(stake/10, pot) to an alive crewmate (spy gets 0, silently)
→ game over → `revealRoles` → `settleRoom` (KMS-signed roles) → winners `claimPayout` (pot / winners).
Cancelled / aborted room → `claimRefund` = stake − ceil(bounties paid / players).
Anyone may `revealPot` after the game: the prize pool is secret until then.

## Deployment
`npm start` / `npm run deploy` compiles the core (game + vault + stats) together — an error there stops the deploy — and each optional
module on its own: if one fails to compile the game still deploys and that feature is hidden in the UI (the log says which).
Addresses and ABIs go to `src/config/deployment.json`.

## Tests
`npm test` copies `contracts/` into `hh/contracts/` (scripts/sync-hh.mjs) and runs Hardhat with the FHEVM mock:
`game.test.ts` (game logic), `stake.test.ts` (vault stakes/payouts/refunds), `modules.test.ts` (Quick Match, leaderboard, last will, bounty, bribe, chat, wiring).
