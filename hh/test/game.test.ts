import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { deployAll, enc8, myRole, allRoles, newPvpRoom, splitRoles, checkpoint, tally, publicDecryptPending, revealAndDecrypt, GAS, Phase, Winner, NO_TARGET } from "./helpers";

describe("Lost Island - game logic (FHE mock)", function () {
  before(function () { if (!fhevm.isMock) this.skip(); });

  describe("roles (encrypted, random, private)", () => {
    it("deals exactly ONE spy among 11 slots in a solo game, and the human can read only their own role", async () => {
      const { game, signers } = await deployAll(false);
      const [me, other] = signers;
      await game.connect(me).createSoloGame(ethers.ZeroAddress, GAS);
      const roomId = await game.roomCount();
      const roles = await allRoles(game, roomId, 11);
      expect(roles.filter((r) => r === 1)).to.have.length(1);
      expect(roles.filter((r) => r === 0)).to.have.length(10);
      expect(await myRole(game, roomId, me)).to.eq(roles[0]);
      // another wallet is NOT allowed to decrypt the role handle
      const h = await game.getRoleHandle(roomId, me.address);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, h, await game.getAddress(), other)).to.be.rejected;
    });

    it("the spy is not always in the same slot (randomness is drawn per game)", async () => {
      const { game, signers } = await deployAll(false);
      const seen = new Set<number>();
      for (let i = 0; i < 8; i++) {
        await game.connect(signers[0]).createSoloGame(ethers.ZeroAddress, GAS);
        seen.add((await allRoles(game, await game.roomCount(), 11)).indexOf(1));
      }
      expect(seen.size).to.be.greaterThan(1);
    });

    it("PvP: every player gets exactly one role and exactly one spy exists", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 4);
      const roomId = await newPvpRoom(game, ps);
      const { roles } = await splitRoles(game, roomId, ps);
      expect(roles.filter((r) => r === 1)).to.have.length(1);
    });
  });

  describe("room rules", () => {
    it("needs >= 3 players, only the host starts, cannot join twice, solo rooms are closed", async () => {
      const { game, signers } = await deployAll(false);
      const [a, b, c] = signers;
      await game.connect(a).createRoom(false);
      const id = await game.roomCount();
      await expect(game.connect(a).startGame(id, GAS)).to.be.revertedWith("Need >= 3 players");
      await game.connect(b).joinRoom(id);
      await expect(game.connect(b).joinRoom(id)).to.be.revertedWith("Already joined");
      await game.connect(c).joinRoom(id);
      await expect(game.connect(b).startGame(id, GAS)).to.be.revertedWith("Only host");
      await game.connect(a).startGame(id, GAS);
      await expect(game.connect(signers[3]).joinRoom(id)).to.be.revertedWith("Wrong phase");
      await game.connect(a).createRoom(true);
      await expect(game.connect(b).joinRoom(await game.roomCount())).to.be.revertedWith("Solo room");
    });
  });

  describe("secret kill", () => {
    it("every player can act once per round; a crewmate's action is a silent no-op (no revert => no role leak)", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      const { spy, crew } = await splitRoles(game, roomId, ps);
      for (const p of [spy, ...crew]) {
        const [h, proof] = await enc8(game, p, ps.indexOf(crew[0]) === ps.indexOf(p) ? ps.indexOf(spy) : ps.indexOf(crew[0]));
        await game.connect(p).executeSecretKill(roomId, h, proof, GAS);
      }
      // the crewmate that "targeted" the spy did NOT kill them: the spy is still alive
      const spySlot = ps.indexOf(spy);
      const st = await fhevm.userDecryptEuint(FhevmType.euint8, await game.getStatusHandle(roomId, spySlot), await game.getAddress(), spy);
      expect(st).to.eq(1n);
      const [h2, p2] = await enc8(game, spy, 0);
      await expect(game.connect(spy).executeSecretKill(roomId, h2, p2)).to.be.revertedWith("Already acted this round");
    });

    it("the spy's kill hits an encrypted target; the victim sees they are dead, others stay alive", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 4);
      const roomId = await newPvpRoom(game, ps);
      const { spy, crew } = await splitRoles(game, roomId, ps);
      const victim = crew[0];
      const [h, proof] = await enc8(game, spy, ps.indexOf(victim));
      await expect(game.connect(spy).executeSecretKill(roomId, h, proof, GAS)).to.emit(game, "Acted");
      const addr = await game.getAddress();
      expect(await fhevm.userDecryptEuint(FhevmType.euint8, await game.getStatusHandle(roomId, ps.indexOf(victim)), addr, victim)).to.eq(0n);
      expect(await fhevm.userDecryptEuint(FhevmType.euint8, await game.getStatusHandle(roomId, ps.indexOf(crew[1])), addr, crew[1])).to.eq(1n);
    });

    it("the spy cannot kill itself and a dead spy-turn cannot be abused (target = own slot is a no-op)", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      const { spy } = await splitRoles(game, roomId, ps);
      const [h, proof] = await enc8(game, spy, ps.indexOf(spy));
      await game.connect(spy).executeSecretKill(roomId, h, proof, GAS);
      const st = await fhevm.userDecryptEuint(FhevmType.euint8, await game.getStatusHandle(roomId, ps.indexOf(spy)), await game.getAddress(), spy);
      expect(st).to.eq(1n);
    });
  });

  describe("tasks + checkpoint", () => {
    it("tasks are capped at 3 per player for EVERY role (the spy fakes them identically)", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      const { spy } = await splitRoles(game, roomId, ps);
      for (let i = 0; i < 3; i++) await game.connect(spy).completeTask(roomId, GAS);
      await expect(game.connect(spy).completeTask(roomId)).to.be.revertedWith("No tasks left");
    });

    it("crew wins when enough crew tasks are done (spy's fake tasks do not count)", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      const { spy, crew } = await splitRoles(game, roomId, ps);
      for (let i = 0; i < 3; i++) await game.connect(spy).completeTask(roomId, GAS);
      for (const c of crew) for (let i = 0; i < 2; i++) await game.connect(c).completeTask(roomId, GAS);
      await checkpoint(game, roomId, ps[0]);                       // 4 of 6 crew tasks -> nobody wins yet
      expect((await game.getRoom(roomId)).phase).to.eq(Phase.Playing);
      await expect(game.connect(ps[0]).requestCheckpoint(roomId)).to.be.revertedWith("Checkpoint already done");
      for (const c of crew) await game.connect(c).completeTask(roomId, GAS);
      // next round is needed for a new checkpoint: advance via a meeting that ends in a tie
      await game.connect(ps[0]).callMeeting(roomId, GAS);
      for (let i = 0; i < 3; i++) { const [h, proof] = await enc8(game, ps[i], (i + 1) % 3); await game.connect(ps[i]).castShieldedVote(roomId, h, proof, GAS); }
      await tally(game, roomId, ps[0]);
      const room = await game.getRoom(roomId);
      expect(room.phase).to.eq(Phase.Finished);                      // tasksDone is part of the tally result
      expect(room.winner).to.eq(Winner.Crewmates);
    });

    it("the spy wins once crew alive <= spy alive", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      const { spy, crew } = await splitRoles(game, roomId, ps);
      const [h, proof] = await enc8(game, spy, ps.indexOf(crew[0]));
      await game.connect(spy).executeSecretKill(roomId, h, proof, GAS);
      await checkpoint(game, roomId, spy);
      const room = await game.getRoom(roomId);
      expect(room.phase).to.eq(Phase.Finished);
      expect(room.winner).to.eq(Winner.Impostors);
    });

    it("a forged checkpoint proof is rejected", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      await game.connect(ps[0]).requestCheckpoint(roomId, GAS);
      const d = await publicDecryptPending(game, roomId);
      const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool", "bool"], [true, true]);   // claim "everybody wins"
      await expect(game.connect(ps[0]).submitCheckpoint(roomId, forged, d.decryptionProof)).to.be.reverted;
    });
  });

  describe("shielded voting", () => {
    it("votes are ciphertext; the right spy is ejected, roles are revealed in the event, crew wins", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 4);
      const roomId = await newPvpRoom(game, ps);
      const { spy } = await splitRoles(game, roomId, ps);
      await game.connect(ps[1]).callMeeting(roomId, GAS);
      for (const p of ps) {
        const [h, proof] = await enc8(game, p, ps.indexOf(spy));
        await game.connect(p).castShieldedVote(roomId, h, proof, GAS);
      }
      await expect(tally(game, roomId, ps[0])).to.emit(game, "PlayerEjected").withArgs(roomId, ps.indexOf(spy), true);
      const room = await game.getRoom(roomId);
      expect(room.winner).to.eq(Winner.Crewmates);
      expect(room.phase).to.eq(Phase.Finished);
    });

    it("a tie ejects nobody and the game goes on to round 2", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 4);
      const roomId = await newPvpRoom(game, ps);
      await game.connect(ps[0]).callMeeting(roomId, GAS);
      for (let i = 0; i < 4; i++) { const [h, proof] = await enc8(game, ps[i], (i + 1) % 4); await game.connect(ps[i]).castShieldedVote(roomId, h, proof, GAS); }
      await expect(tally(game, roomId, ps[0])).to.emit(game, "NoEjection");
      const room = await game.getRoom(roomId);
      expect(room.phase).to.eq(Phase.Playing);
      expect(room.round).to.eq(2);
    });

    it("skip votes (255) eject nobody; one vote per player; outsiders cannot vote; dead voters weigh 0", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      const { spy, crew } = await splitRoles(game, roomId, ps);
      const [k, kp] = await enc8(game, spy, ps.indexOf(crew[0]));
      await game.connect(spy).executeSecretKill(roomId, k, kp, GAS);   // crew[0] is dead
      await game.connect(ps[0]).callMeeting(roomId, GAS);
      const [h, proof] = await enc8(game, ps[0], NO_TARGET);
      await game.connect(ps[0]).castShieldedVote(roomId, h, proof, GAS);
      const [h2, p2] = await enc8(game, ps[0], 1);
      await expect(game.connect(ps[0]).castShieldedVote(roomId, h2, p2)).to.be.revertedWith("Already voted");
      const [h3, p3] = await enc8(game, signers[5], 1);
      await expect(game.connect(signers[5]).castShieldedVote(roomId, h3, p3)).to.be.revertedWith("Not in room");
      await expect(game.connect(ps[0]).tallyVotes(roomId)).to.be.revertedWith("Voting still open");   // others have not voted yet
    });

    it("the vote can only be tallied after the deadline when someone abstains", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      await game.connect(ps[0]).callMeeting(roomId, GAS);
      await expect(game.connect(ps[0]).tallyVotes(roomId)).to.be.revertedWith("Voting still open");
      await ethers.provider.send("evm_increaseTime", [121]); await ethers.provider.send("evm_mine", []);
      await game.connect(ps[0]).tallyVotes(roomId, GAS);
      expect((await game.getRoom(roomId)).phase).to.eq(Phase.Tallying);
    });
  });

  describe("verifiable death + role reveal (fairness audit)", () => {
    it("a killed player proves their death through the KMS; a living player cannot fake it", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 4);
      const roomId = await newPvpRoom(game, ps);
      const { spy, crew } = await splitRoles(game, roomId, ps);
      const victim = crew[0];
      const [h, proof] = await enc8(game, spy, ps.indexOf(victim));
      await game.connect(spy).executeSecretKill(roomId, h, proof, GAS);

      await game.connect(crew[1]).requestDeathProof(roomId);       // alive player tries
      let d = await publicDecryptPending(game, roomId);
      await expect(game.connect(crew[1]).submitDeathProof(roomId, d.abiEncodedClearValues, d.decryptionProof)).to.not.emit(game, "PlayerAssassinated");
      expect((await game.getPlayers(roomId)).ejected[ps.indexOf(crew[1])]).to.eq(false);   // still alive, and the room is NOT frozen
      expect((await game.getRoom(roomId)).pendingKind).to.eq(0);

      await game.connect(victim).requestDeathProof(roomId);
      d = await publicDecryptPending(game, roomId);
      await expect(game.connect(victim).submitDeathProof(roomId, d.abiEncodedClearValues, d.decryptionProof))
        .to.emit(game, "PlayerAssassinated").withArgs(roomId, ps.indexOf(victim), 1);
      expect((await game.getPlayers(roomId)).ejected[ps.indexOf(victim)]).to.eq(true);
    });

    it("roles can only be unlocked when the game is over; then every role is public and matches the deal (1 spy)", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      await expect(game.connect(ps[0]).revealRoles(roomId)).to.be.revertedWith("Wrong phase");
      const { spy, crew } = await splitRoles(game, roomId, ps);
      const [h, proof] = await enc8(game, spy, ps.indexOf(crew[0]));
      await game.connect(spy).executeSecretKill(roomId, h, proof, GAS);
      await checkpoint(game, roomId, spy);
      const dec = await revealAndDecrypt(game, roomId, ps[0], 3);
      const vals = dec.abiEncodedClearValues;
      const words = (vals.length - 2) / 64;
      const revealed = Array.from({ length: words }, (_, i) => Number(BigInt("0x" + vals.slice(2 + i * 64, 2 + (i + 1) * 64))));
      expect(revealed.filter((r) => r === 1)).to.have.length(1);
      expect(revealed[ps.indexOf(spy)]).to.eq(1);
    });
  });

  describe("solo mode (bots + session-wallet operator)", () => {
    it("bots run in batches, the operator can drive technical steps but cannot play as the human", async () => {
      const { game, signers } = await deployAll(false);
      const [me, op] = signers;
      await game.connect(me).createSoloGame(op.address, GAS);
      const roomId = await game.roomCount();
      expect(await game.operatorOf(roomId)).to.eq(op.address);
      expect(await game.pendingBotTurns(roomId)).to.eq(10);   // 10 bots, BOTS_PER_TX = 3 -> 10, 7, 4, 1, 0
      await game.connect(op).runBotTurns(roomId, GAS);
      expect(await game.pendingBotTurns(roomId)).to.eq(7);
      await game.connect(op).runBotTurns(roomId, GAS);
      expect(await game.pendingBotTurns(roomId)).to.eq(4);
      await game.connect(op).runBotTurns(roomId, GAS);
      expect(await game.pendingBotTurns(roomId)).to.eq(1);
      await game.connect(op).runBotTurns(roomId, GAS);
      expect(await game.pendingBotTurns(roomId)).to.eq(0);
      await expect(game.connect(op).runBotTurns(roomId)).to.be.revertedWith("Bots already acted");
      await expect(game.connect(op).completeTask(roomId)).to.be.revertedWith("Not in room");
      const [h, proof] = await enc8(game, op, 1);
      await expect(game.connect(op).executeSecretKill(roomId, h, proof)).to.be.revertedWith("Not in room");
      await expect(game.connect(signers[4]).runBotTurns(roomId)).to.be.revertedWith("Not in room");
    });

    it("castBotVote: the bots vote the way the debate decided (ciphertext ballots); uncovered bots fall back to random; abuse is rejected", async () => {
      const { game, signers } = await deployAll(false);
      const [me, op, outsider] = signers;
      await game.connect(me).createSoloGame(op.address, GAS);
      const roomId = await game.roomCount();
      await game.connect(op).callMeeting(roomId, GAS);   // no bot turns -> nobody was killed, all 11 are alive
      expect(await game.pendingBotVotes(roomId)).to.eq(10);
      // all the ballots go through ONE input proof, bound to the operator that sends them (exactly what the client does)
      const bots = [1, 2, 3, 4, 5, 6, 7];
      const e = await fhevm.createEncryptedInput(await game.getAddress(), op.address);
      bots.forEach((b) => e.add8(b === 4 ? 5 : 4));   // everyone accuses slot 4 (bot 4 itself accuses 5)
      const enc = await e.encrypt();
      const vote = (who: any, b: number, k: number) => game.connect(who).castBotVote(roomId, b, enc.handles[k], enc.inputProof, GAS);
      // rejections: not a bot (the human slot), not a room member, a bot cannot vote twice
      await expect(vote(op, 0, 0)).to.be.revertedWithCustomError(game, "BadBotBallots");
      await expect(vote(outsider, 1, 0)).to.be.revertedWith("Not in room");
      await vote(op, 1, 0);
      await expect(vote(op, 1, 0)).to.be.revertedWithCustomError(game, "BadBotBallots");
      for (let k = 1; k < bots.length; k++) await vote(op, bots[k], k);
      expect(await game.pendingBotVotes(roomId)).to.eq(3);
      await expect(game.connect(op).tallyVotes(roomId, GAS)).to.be.revertedWith("Bots must vote first");
      await game.connect(op).runBotVotes(roomId, GAS);   // bots 8..10 were not covered: encrypted randomness, as before
      expect(await game.pendingBotVotes(roomId)).to.eq(0);
      // the human also votes 4: slot 4 now has at least 7 + 1 votes, the random bots cannot catch up (max 3)
      const [h, proof] = await enc8(game, me, 4);
      await game.connect(me).castShieldedVote(roomId, h, proof, GAS);
      await expect(tally(game, roomId, op)).to.emit(game, "PlayerEjected");
      expect((await game.getPlayers(roomId)).ejected[4]).to.eq(true);
    });

    it("castBotVote is solo-only (PvP ballots belong to real wallets)", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      await game.connect(ps[1]).callMeeting(roomId, GAS);
      const [h, proof] = await enc8(game, ps[0], 1);
      await expect(game.connect(ps[0]).castBotVote(roomId, 1, h, proof, GAS)).to.be.revertedWithCustomError(game, "BadBotBallots");
    });

    it("client-attested actions (reportExecution / reportFriendlyKill) are solo-only", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await newPvpRoom(game, ps);
      await expect(game.connect(ps[0]).reportExecution(roomId)).to.be.revertedWith("Solo only: client-attested");
      await expect(game.connect(ps[0]).reportFriendlyKill(roomId, 1)).to.be.revertedWith("Solo only: client-attested");
    });

    it("a full solo ending: execution ends the game on-chain and roles unlock afterwards", async () => {
      const { game, signers } = await deployAll(false);
      const [me] = signers;
      await game.connect(me).createSoloGame(ethers.ZeroAddress, GAS);
      const roomId = await game.roomCount();
      await expect(game.connect(me).reportExecution(roomId)).to.emit(game, "PlayerExecuted");
      expect((await game.getRoom(roomId)).winner).to.eq(Winner.FriendlyFire);
      await game.connect(me).revealRoles(roomId);
    });
  });
});
