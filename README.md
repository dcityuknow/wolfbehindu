# 🪂 Lost Island — a confidential social-deduction game on the Zama Protocol

> **This project is not audited, endorsed or operated by Zama. Use at your own risk.**

A squad of paratroopers is blown onto a desert island. **One of them is a spy.** Nobody — not the other players, not the host, not a block explorer, not the contract itself — knows who, until the game is over and anyone can verify it.

Built for *Zama Developer Program, Mainnet Season 5 — Confidential Gaming*. Smart contract (Solidity + FHEVM), Vite/TypeScript/Three.js frontend, deployed on **Sepolia**.

## What's new in v5 (PvP depth)
* **Quick Match** and public lobbies; any member can start a public lobby after 2 minutes. Private rooms still work with a code/link.
* **Encrypted prize pool**: stakes go to a separate `StakeVault`; the pot is only revealed (publicly decrypted) after the game.
* **Secret task bounties** paid from the pot; **last will** of a murdered player (encrypted, table-only); **bribe fund** with conditional encrypted payment; **table chat**.
* **Leaderboard**: detectives (crew wins), assassins (spy wins), and cUSDT winners who opt in to publish their encrypted total.
* **FHE overlay** (matrix rain + glitch) while roles are dealt / decrypted / settled; **footsteps**, **emergency siren**, murder sting and a racing heartbeat before a meeting ends.
* Contracts split into modules and satellites — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Why this game cannot exist on a transparent chain

| What must stay hidden | On a normal chain | Here |
|---|---|---|
| Who the spy is | Readable from storage / calldata the moment it is dealt | `euint8` role, `FHE.allow` only to its owner |
| Who the spy kills | The kill tx names the victim | Target is an **encrypted input**; success is computed with `FHE.select` |
| Whether I *am* the spy | A revert / success / gas pattern would leak it | **No data-dependent revert**: every player sends the same action, crew's is a silent no-op |
| Who voted for whom | Public calldata | Encrypted ballots, tallied with encrypted `argmax`; only the *result* is decrypted |
| Who is alive | Public state | Encrypted `status`; revealed to the room only when a meeting opens |
| Task progress (hints who is faking) | Public counter | Encrypted counter; the spy's tasks add 0 |
| Cash stakes / pot (ERC-7984) | Public balances and amounts | cUSDT confidential transfers; paid amounts and the pot stay encrypted |

If the state were public the game would be over before it started — a block explorer would show the spy.

## Fairness (randomness + verification)
- **Randomness is on-chain:** the spy slot is `FHE.rem(FHE.randEuint8(128), n)` inside the coprocessor. Nobody can predict or bias it, including the host. (For n = 7 the draw is biased by ~0.8 %; documented, acceptable.)
- **Public results are KMS-verified:** win checkpoints, vote results, death proofs and the final roles go `makePubliclyDecryptable` → relayer `publicDecrypt` → `FHE.checkSignatures`. The contract refuses any cleartext the KMS did not sign for *exactly the stored handles* (tests: forged checkpoint / forged roles are rejected).
- **Anyone can audit a finished game:** `revealRoles` makes every role public once the room is `Finished` (never earlier). The UI shows who the spy was; in staked rooms `settleStake` verifies those roles on-chain before any money moves.

## Game modes
| Mode | What it is | Where |
|---|---|---|
| **Solo** | 1 human + 6 bots in a 3D voxel island (campfire meetings, tasks, firefights, friendly-fire rules). One signature starts a game; a throw-away *session wallet* runs bot turns without popups. | `Play` button |
| **PvP table (3–7 players)** | Real wallets, the chain is the shared world: tasks, an encrypted secret action, emergency meetings, shielded voting, KMS-verified endings. Invite by link `?room=ID`. | `👥 Multiplayer table` |
| **Staked PvP** | Each player stakes cUSDT (ERC-7984) with an **encrypted transfer**. Winners split the pot; refunds if cancelled/stalled. | create a *staked room* |

### Staked rooms in detail (ERC-7984)
1. Player approves the game as operator: `cUSDT.setOperator(game, until)` (UI does it, 30 days).
2. `createStakedRoom(stake)` / `joinRoom(id)` pull `stake` with `confidentialTransferFrom`. If a balance is too low the token moves **0 instead of reverting** (a revert would leak the balance), so the contract stores what was **really paid** (`paid`, encrypted) and sums it into an encrypted `pot`.
3. Game ends → `revealRoles` → `settleStake(cleartexts, proof)` verifies every role against the stored handles and fixes the winning side (all commandos, or the spy).
4. Each winner calls `claimPayout`: `share = pot / winners` (encrypted `FHE.div`), paid only if their own stake really arrived — **no free riding**. A solo spy takes the whole pot.
5. `cancelRoom` (host any time, anyone after 24 h) and `abortStalled` (anyone after 48 h) → everybody pulls back exactly what they paid with `claimRefund`.

## What is encrypted / verified / off-chain (honest limits)
- **Encrypted on-chain:** role, status, kill target, votes, task counter, paid stake, pot.
- **Public on purpose:** room membership, plaintext *turn* counters that are identical for every role (tasks done ≤ 3, "has voted", "acted"), the entry **stake amount** (a public room rule), the ejected player + ejected role after a vote, the winner, all roles after game over.
- **Off-chain (Solo 3D layer):** movement, shooting, bot AI and positions. A real-time shooter cannot run on-chain. Two solo-only actions (`reportFriendlyKill`, `reportExecution`) are client-attested and the contract **rejects them in PvP**, so nobody can declare another player dead or end a staked game.
- **PvP has no shared 3D world** (no netcode): the encrypted table is turn-based on purpose — every secret action is an on-chain action.
- Known trade-offs: only one spy per game; FHE transactions need generous gas limits (the UI sets them); stake token address must be set to the real cUSDT (see below).

## Run it
Requires Node 18+, MetaMask on Sepolia, a **throw-away test wallet** with Sepolia ETH.

```bash
npm install
cp .env.example .env        # put a TEST wallet PRIVATE_KEY in .env (never commit it)
npm run deploy              # compiles + deploys to Sepolia, writes src/config/deployment.json
npm run dev                 # http://localhost:3000
# or: npm start  (Windows: double-click CHAY.bat) = install + deploy-if-needed + dev
```

**Stake token.** `scripts/deploy.mjs` defaults to the Sepolia confidential USDT from the [Zama protocol registry](https://github.com/zama-ai/protocol-registry/blob/main/testnet.md#ethereum-sepolia-ethereum_sepolia) (`0x4E7B06D78965594eB5EF5414c357ca21E1554491`). **Re-check it on the registry before deploying**; override with `STAKE_TOKEN=0x…` in `.env`, or `0x000…0` to disable staking. You need some cUSDT in your wallet to play a staked room.

## Tests (contract)
31 Hardhat tests on the FHEVM mock: roles (exactly one spy, private, random), secret kill (crew no-op, no self-kill, once per round), tasks, checkpoints, shielded voting (ties, skip, dead voters, deadline), KMS proofs (forged proofs rejected), death proofs, role reveal, solo operator limits, **staking** (encrypted transfers, crew/spy payouts, forged settle, under-funded player, cancel, timeout, abort, refunds).

```bash
npm test        # installs ./hh and runs hardhat test
```
Note: the Zama Hardhat plugin (0.4.2) targets `@fhevm/solidity` 0.11.1, so the test project in `hh/` compiles the contract against 0.11.1, while the app/deploy script use 0.13.4 (the contract compiles against both). `hh/` uses the npm `solc` package, so it works offline.

## Contract API (short)
`createRoom` · `createSoloGame` · `createStakedRoom` · `joinRoom` · `startGame` · `completeTask` · `executeSecretKill` (encrypted target) · `callMeeting` · `castShieldedVote` (encrypted) · `tallyVotes` → `finalizeTally` · `requestCheckpoint` → `submitCheckpoint` · `requestDeathProof` → `submitDeathProof` · `revealRoles` · `settleStake` · `claimPayout` · `cancelRoom` · `abortStalled` · `claimRefund` · views. NatSpec in `contracts/SpaceImpostorFHE.sol`.

## Structure
```
contracts/SpaceImpostorFHE.sol     the game + ERC-7984 stakes
contracts/mocks/MockCUSDT.sol      test-only confidential token
hh/                                Hardhat project: FHEVM-mock tests (test/game.test.ts, test/stake.test.ts)
scripts/deploy.mjs · run.mjs       compile + deploy · one-command launcher
src/web3/                          wallet, FHE (encrypt / user-decrypt / public-decrypt), chain.ts, pvp.ts
src/gameplay/                      Solo rules (combat, meeting, round…) and pvp.ts (the encrypted table)
src/world/ · src/ui/               3D island and DOM UI (no blockchain knowledge)
docs/CHANGELOG.md                  development history
```

## Controls (Solo)
WASD move · Space jump · **E** interact · **Q** assassinate (spy) · Left click shoot · Right click aim · **R** reload · **G** grenade · **1–4** weapons · **V** view · Shift roll.

## Security notes
- Never commit `.env`. Use throw-away wallets only. The session wallet key lives in this browser's `localStorage`; keep a tiny balance in it.
- Not audited. Testnet only.
