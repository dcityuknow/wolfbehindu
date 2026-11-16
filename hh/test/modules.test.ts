import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { deployAll, enc8, encFor, splitRoles, checkpoint, tally, publicDecryptPending, revealAndDecrypt, balanceOf, GAS, Phase, Winner, NO_TARGET } from "./helpers";

const STAKE = 100n;
const FUTURE = 2n ** 47n;
const decode = (abi: string) => (abi.slice(2).match(/.{64}/g) ?? []).map((w) => BigInt("0x" + w));

/** Free PvP room (n players) -> started. */
async function freeRoom(game: any, ps: any[], open = false) {
  await game.connect(ps[0])[open ? "createOpenRoom" : "createRoom"](...(open ? [0] : [false]));
  const roomId: bigint = await game.roomCount();
  for (const p of ps.slice(1)) await game.connect(p).joinRoom(roomId, GAS);
  return roomId;
}
/** Staked PvP room: funds + vault approval for everybody, 3 players, started. */
async function stakedStart(extra: { withBribeApproval?: boolean } = {}) {
  const d = await deployAll(true);
  const ps = d.signers.slice(0, 3);
  for (const p of ps) {
    await d.token.mint(p.address, 1000n);
    await d.token.connect(p).setOperator(await d.vault.getAddress(), FUTURE);
    if (extra.withBribeApproval) await d.token.connect(p).setOperator(await d.bribe.getAddress(), FUTURE);
  }
  await d.game.connect(ps[0]).createStakedRoom(STAKE, GAS);
  const roomId: bigint = await d.game.roomCount();
  for (const p of ps.slice(1)) await d.game.connect(p).joinRoom(roomId, GAS);
  await d.game.connect(ps[0]).startGame(roomId, GAS);
  const roles = await splitRoles(d.game, roomId, ps);
  return { ...d, ps, roomId, ...roles };
}

describe("Lost Island - modules (vault, quick match, stats, will, bounty, bribe, chat)", function () {
  before(function () { if (!fhevm.isMock) this.skip(); });

  describe("wiring", () => {
    it("configure / wire are one-shot and deployer-only; module hooks reject strangers", async () => {
      const { game, vault, stats, signers } = await deployAll(true);
      await expect(game.configure(ethers.ZeroAddress, ethers.ZeroAddress, [])).to.be.revertedWith("Already configured");
      await expect(vault.wire(ethers.ZeroAddress, ethers.ZeroAddress, [])).to.be.revertedWith("Already wired");
      await expect(stats.wire(ethers.ZeroAddress, ethers.ZeroAddress)).to.be.revertedWith("Already wired");
      await expect(game.connect(signers[1]).crewAliveFlag(1, signers[1].address)).to.be.revertedWith("Not a module");
      await expect(vault.connect(signers[1]).spendBounty(1, signers[1].address, ethers.ZeroHash)).to.be.revertedWith("Not a module");
      await expect(vault.connect(signers[1]).deposit(1, signers[1].address, 5)).to.be.revertedWith("Only game");
    });
  });

  describe("Quick Match (public rooms)", () => {
    it("public lobbies are listed, private ones are not, started ones disappear", async () => {
      const { game, signers } = await deployAll(false);
      const [a, b, c, d] = signers;
      const pub = await freeRoom(game, [a, b], true);
      const priv = await freeRoom(game, [c, d], false);
      let o = await game.getOpenRooms(0, 50);
      expect(o.ids.map((x: bigint) => x)).to.include(pub);
      expect(o.ids.map((x: bigint) => x)).to.not.include(priv);
      expect(Number(o.counts[0])).to.eq(2);
      await game.connect(signers[2]).joinRoom(pub, GAS);
      await game.connect(a).startGame(pub, GAS);
      o = await game.getOpenRooms(0, 50);
      expect(o.ids.map((x: bigint) => x)).to.not.include(pub);
    });

    it("any member (not the host) can start a PUBLIC lobby only after the delay; a private one never", async () => {
      const { game, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const pub = await freeRoom(game, ps, true), priv = await freeRoom(game, ps.slice(0, 3).map((_, i) => signers[3 + i]), false);
      await expect(game.connect(ps[1]).startGame(pub, GAS)).to.be.revertedWith("Only host");
      await expect(game.connect(signers[4]).startGame(priv, GAS)).to.be.revertedWith("Only host");
      await ethers.provider.send("evm_increaseTime", [121]); await ethers.provider.send("evm_mine", []);
      await game.connect(ps[1]).startGame(pub, GAS);
      expect((await game.getRoom(pub)).phase).to.eq(Phase.Playing);
      await expect(game.connect(signers[4]).startGame(priv, GAS)).to.be.revertedWith("Only host");
      await expect(game.connect(signers[9]).startGame(pub, GAS)).to.be.reverted;   // outsider (and wrong phase)
    });
  });

  describe("leaderboard (LostIslandStats)", () => {
    it("settleRoom verifies the KMS roles and credits wins per role; it cannot run twice; only the game can write", async () => {
      const { game, stats, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await freeRoom(game, ps);
      await game.connect(ps[0]).startGame(roomId, GAS);
      const { spy, crew } = await splitRoles(game, roomId, ps);
      const [h, proof] = await enc8(game, spy, ps.indexOf(crew[0]));
      await game.connect(spy).executeSecretKill(roomId, h, proof, GAS);
      await checkpoint(game, roomId, spy);
      expect((await game.getRoom(roomId)).winner).to.eq(Winner.Impostors);

      const d = await revealAndDecrypt(game, roomId, spy, 3);
      await game.connect(crew[1]).settleRoom(roomId, d.abiEncodedClearValues, d.decryptionProof, GAS);
      await expect(game.connect(crew[1]).settleRoom(roomId, d.abiEncodedClearValues, d.decryptionProof)).to.be.revertedWith("Already settled");
      const rs = await stats.recordOf(spy.address);
      expect([Number(rs.games), Number(rs.impGames), Number(rs.impWins), Number(rs.crewWins)]).to.deep.eq([1, 1, 1, 0]);
      const rc = await stats.recordOf(crew[0].address);
      expect([Number(rc.games), Number(rc.crewGames), Number(rc.crewWins), Number(rc.impWins)]).to.deep.eq([1, 1, 0, 0]);
      expect(await stats.playersCount()).to.eq(3n);
      const pg = await stats.page(0, 10);
      expect(pg.wallets.length).to.eq(3);
      await expect(stats.connect(spy).recordGame(roomId, [spy.address], [1], 1, false)).to.be.revertedWith("Only game");
    });
  });

  describe("last will", () => {
    it("only a PROVEN murder victim can write it; the table (not outsiders) can decrypt who they blame", async () => {
      const { game, will, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await freeRoom(game, ps);
      await game.connect(ps[0]).startGame(roomId, GAS);
      const { spy, crew } = await splitRoles(game, roomId, ps);
      const wa = await will.getAddress();
      const text = Array.from({ length: 4 }, (_, i) => BigInt(0x41 + i) << 56n);   // "A…", "B…", ...
      const write = async (who: any, suspect: number) => {
        const e = await encFor(wa, who, (b) => { b.add8(suspect); for (const t of text) b.add64(t); });
        return will.connect(who).writeWill(roomId, e.handles[0], e.handles[1], e.handles[2], e.handles[3], e.handles[4], e.inputProof, GAS);
      };
      const spySlot = ps.indexOf(spy), victim = crew[0];
      await expect(write(victim, spySlot)).to.be.revertedWith("Only a proven murder victim");   // alive

      const [h, proof] = await enc8(game, spy, ps.indexOf(victim));
      await game.connect(spy).executeSecretKill(roomId, h, proof, GAS);
      await expect(write(victim, spySlot)).to.be.revertedWith("Only a proven murder victim");   // dead, but not proven yet
      await game.connect(victim).requestDeathProof(roomId, GAS);
      const dp = await publicDecryptPending(game, roomId);
      await game.connect(victim).submitDeathProof(roomId, dp.abiEncodedClearValues, dp.decryptionProof);
      expect(await game.isAssassinated(roomId, ps.indexOf(victim))).to.eq(true);

      await expect(write(victim, spySlot)).to.emit(will, "WillWritten");
      await expect(write(victim, spySlot)).to.be.revertedWith("Will already written");
      const w = await will.readWill(roomId, ps.indexOf(victim));
      expect(w.written).to.eq(true);
      for (const member of [spy, crew[1], victim]) {
        const s = await fhevm.userDecryptEuint(FhevmType.euint8, w.suspect, wa, member);
        expect(Number(s)).to.eq(spySlot);
      }
      const t0 = await fhevm.userDecryptEuint(FhevmType.euint64, w.text[0], wa, crew[1]);
      expect(t0).to.eq(text[0]);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, w.suspect, wa, signers[8])).to.be.rejected;   // outsider
    });
  });

  describe("room chat", () => {
    it("members only, 1..160 bytes, not after the game", async () => {
      const { game, chat, signers } = await deployAll(false);
      const ps = signers.slice(0, 3);
      const roomId = await freeRoom(game, ps);
      await expect(chat.connect(ps[1]).say(roomId, "hello table")).to.emit(chat, "Message");
      await expect(chat.connect(signers[8]).say(roomId, "psst")).to.be.revertedWith("Not in room");
      await expect(chat.connect(ps[1]).say(roomId, "")).to.be.revertedWith("Bad length");
      await expect(chat.connect(ps[1]).say(roomId, "x".repeat(161))).to.be.revertedWith("Bad length");
    });
  });

  describe("secret task bounty (BountyBoard + pot)", () => {
    it("alive crew are paid stake/10 out of the pot; the spy's claim pays 0 without reverting; one claim each", async () => {
      const { game, vault, token, bounty, ps, roomId, spy, crew } = await stakedStart();
      await expect(bounty.connect(crew[0]).claimBounty(roomId)).to.be.revertedWith("No task assigned");
      for (const p of ps) await bounty.connect(p).assignTask(roomId, GAS);
      await expect(bounty.connect(ps[0]).assignTask(roomId)).to.be.revertedWith("Already assigned");
      const ba = await bounty.getAddress();
      const task = await fhevm.userDecryptEuint(FhevmType.euint8, await bounty.taskHandle(roomId, crew[0].address), ba, crew[0]);
      expect(Number(task)).to.be.lessThan(6);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, await bounty.taskHandle(roomId, crew[0].address), ba, crew[1])).to.be.rejected;

      for (const p of ps) await bounty.connect(p).claimBounty(roomId, GAS);   // nobody reverts, so nothing leaks
      for (const c of crew) expect(await balanceOf(token, c)).to.eq(910n);   // 900 + 10
      expect(await balanceOf(token, spy)).to.eq(900n);                       // paid 0
      await expect(bounty.connect(crew[0]).claimBounty(roomId)).to.be.revertedWith("Already claimed");

      // the pot lost 2 x 10 = 20 -> 280; crew then wins and splits it (140 each)
      for (const c of crew) for (let i = 0; i < 3; i++) await game.connect(c).completeTask(roomId, GAS);
      await checkpoint(game, roomId, ps[0]);
      const d = await revealAndDecrypt(game, roomId, ps[0], 3);
      await game.connect(ps[0]).settleRoom(roomId, d.abiEncodedClearValues, d.decryptionProof, GAS);
      for (const c of crew) await vault.connect(c).claimPayout(roomId, GAS);
      for (const c of crew) expect(await balanceOf(token, c)).to.eq(1050n);   // 900 + 10 + 140

      // the final pot is secret until someone reveals it after the game
      await vault.connect(ps[0]).revealPot(roomId);
      const hp = await vault.getPotHandle(roomId);
      const pot = await fhevm.publicDecrypt([hp]);
      expect(decode(pot.abiEncodedClearValues)[0]).to.eq(280n);
    });

    it("free rooms have no bounties; the pot cannot be revealed while the game runs", async () => {
      const { vault, bounty, roomId, ps, game, signers } = await stakedStart();
      await expect(vault.revealPot(roomId)).to.be.revertedWith("Game still running");
      await game.connect(signers[5]).createRoom(false);
      await expect(bounty.connect(signers[5]).assignTask(await game.roomCount())).to.be.revertedWith("Not a staked room");
      void ps;
    });

    it("an aborted game refunds each player the stake minus an equal (rounded-up) share of the bounties already paid", async () => {
      const { game, vault, token, bounty, ps, roomId, crew, spy, signers } = await stakedStart();
      for (const p of ps) await bounty.connect(p).assignTask(roomId, GAS);
      for (const c of crew) await bounty.connect(c).claimBounty(roomId, GAS);   // 2 x 10 paid
      await ethers.provider.send("evm_increaseTime", [2 * 86400 + 1]); await ethers.provider.send("evm_mine", []);
      await game.connect(signers[7]).abortStalled(roomId);
      for (const p of ps) await vault.connect(p).claimRefund(roomId, GAS);   // 100 - ceil(20/3) = 93 each
      for (const c of crew) expect(await balanceOf(token, c)).to.eq(1003n);   // 900 + 10 bounty + 93
      expect(await balanceOf(token, spy)).to.eq(993n);
    });
  });

  describe("bribe fund (BribeEscrow)", () => {
    const vote = async (game: any, who: any, roomId: bigint, v: number) => { const [h, proof] = await enc8(game, who, v); await game.connect(who).castShieldedVote(roomId, h, proof, GAS); };
    const offer = async (bribe: any, from: any, roomId: bigint, target: string, wanted: number, amt: bigint) => {
      const e = await encFor(await bribe.getAddress(), from, (b) => { b.add8(wanted); b.add64(amt); });
      return bribe.connect(from).offerBribe(roomId, target, e.handles[0], e.handles[1], e.inputProof, GAS);
    };

    it("pays the target ONLY if their secret ballot matched the wish", async () => {
      const { game, token, bribe, ps, roomId, spy, crew } = await stakedStart({ withBribeApproval: true });
      const [briber, target] = crew, spySlot = ps.indexOf(spy);
      await expect(offer(bribe, briber, roomId, target.address, spySlot, 30n)).to.be.revertedWith("No meeting open");
      await game.connect(ps[0]).callMeeting(roomId, GAS);
      await expect(offer(bribe, briber, roomId, briber.address, spySlot, 30n)).to.be.revertedWith("Cannot bribe yourself");
      await offer(bribe, briber, roomId, target.address, spySlot, 30n);
      expect(await balanceOf(token, briber)).to.eq(870n);                    // 900 - 30 locked
      await expect(bribe.connect(target).claimBribe(roomId, 0)).to.be.revertedWith("Voting still open");

      await vote(game, target, roomId, spySlot);                             // does what was asked
      await vote(game, briber, roomId, NO_TARGET); await vote(game, spy, roomId, NO_TARGET);
      await tally(game, roomId, ps[0]);                                      // 1 vote vs 0 => the spy is voted out, game over
      await expect(bribe.connect(briber).claimBribe(roomId, 0)).to.be.revertedWith("Not the target");
      await bribe.connect(target).claimBribe(roomId, 0, GAS);
      expect(await balanceOf(token, target)).to.eq(930n);                    // 900 + 30
      await bribe.connect(briber).reclaim(roomId, 0, GAS);
      expect(await balanceOf(token, briber)).to.eq(870n);                    // nothing left to take back
      await expect(bribe.connect(briber).reclaim(roomId, 0)).to.be.revertedWith("Already reclaimed");
    });

    it("a target who voted differently gets nothing; the briber takes everything back", async () => {
      const { game, token, bribe, ps, roomId, spy, crew } = await stakedStart({ withBribeApproval: true });
      const [briber, target] = crew, spySlot = ps.indexOf(spy);
      await game.connect(ps[0]).callMeeting(roomId, GAS);
      await offer(bribe, briber, roomId, target.address, spySlot, 30n);
      await vote(game, target, roomId, NO_TARGET);                           // ignores the bribe
      await vote(game, briber, roomId, NO_TARGET); await vote(game, spy, roomId, NO_TARGET);
      await tally(game, roomId, ps[0]);
      await bribe.connect(target).claimBribe(roomId, 0, GAS);
      expect(await balanceOf(token, target)).to.eq(900n);                    // paid 0
      await bribe.connect(briber).reclaim(roomId, 0, GAS);
      expect(await balanceOf(token, briber)).to.eq(900n);                    // got the 30 back
      // the terms were readable only by the two of them
      const o = await bribe.offerInfo(roomId, 0);
      await expect(fhevm.userDecryptEuint(FhevmType.euint8, o.wantedHandle, await bribe.getAddress(), spy)).to.be.rejected;
    });

    it("an unclaimed bribe can be reclaimed only after the timeout", async () => {
      const { game, token, bribe, ps, roomId, spy, crew, signers } = await stakedStart({ withBribeApproval: true });
      const [briber, target] = crew;
      await game.connect(ps[0]).callMeeting(roomId, GAS);
      await offer(bribe, briber, roomId, target.address, ps.indexOf(spy), 30n);
      await expect(bribe.connect(briber).reclaim(roomId, 0)).to.be.revertedWith("Not yet");
      await ethers.provider.send("evm_increaseTime", [86401]); await ethers.provider.send("evm_mine", []);
      await bribe.connect(briber).reclaim(roomId, 0, GAS);
      expect(await balanceOf(token, briber)).to.eq(900n);
      await expect(bribe.connect(target).claimBribe(roomId, 0)).to.be.reverted;   // reclaimed: closed (and the meeting is still open)
      void signers;
    });
  });
});
