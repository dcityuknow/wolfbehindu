import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { deployAll, enc8, splitRoles, checkpoint, revealAndDecrypt, balanceOf, GAS, Phase, Winner } from "./helpers";

const STAKE = 100n;
const FUTURE = 2n ** 47n;

async function setup(n: number, funds: bigint[] = []) {
  const { game, token, vault, signers } = await deployAll(true);
  const ps = signers.slice(0, n);
  for (let i = 0; i < n; i++) {
    await token.mint(ps[i].address, funds[i] ?? 1000n);
    await token.connect(ps[i]).setOperator(await vault.getAddress(), FUTURE);   // stakes are pulled by the vault
  }
  return { game, vault, token, ps, signers };
}
async function stakedRoom(game: any, ps: any[]) {
  await game.connect(ps[0]).createStakedRoom(STAKE, GAS);
  const roomId: bigint = await game.roomCount();
  for (const p of ps.slice(1)) await game.connect(p).joinRoom(roomId, GAS);
  return roomId;
}
async function settle(game: any, roomId: bigint, n: number, by: any) {
  const d = await revealAndDecrypt(game, roomId, by, n);
  return game.connect(by).settleRoom(roomId, d.abiEncodedClearValues, d.decryptionProof);
}

describe("Lost Island - ERC-7984 (cUSDT) stakes", function () {
  before(function () { if (!fhevm.isMock) this.skip(); });

  it("staking is disabled when no token is configured; stake must be > 0", async () => {
    const { game, signers } = await deployAll(false);
    await expect(game.connect(signers[0]).createStakedRoom(STAKE)).to.be.revertedWith("Staking disabled");
    const s = await setup(3);
    await expect(s.game.connect(s.ps[0]).createStakedRoom(0)).to.be.revertedWith("Stake is zero");
  });

  it("joining needs the token operator approval (no approval => revert, nothing taken)", async () => {
    const { game, token, signers } = await deployAll(true);
    await token.mint(signers[0].address, 500n);
    await expect(game.connect(signers[0]).createStakedRoom(STAKE, GAS)).to.be.reverted;
  });

  it("stakes move with ENCRYPTED transfers: each player's balance drops by the stake, nobody sees the pot", async () => {
    const { vault, game, token, ps } = await setup(3);
    const roomId = await stakedRoom(game, ps);
    for (const p of ps) expect(await balanceOf(token, p)).to.eq(900n);
    const info = await game.getStakeInfo(roomId);
    expect(info.stake).to.eq(STAKE);
    // the pot handle exists but nobody (not even a player) can decrypt it while the game runs
    await expect(fhevm.userDecryptEuint(FhevmType.euint64, await vault.getPotHandle(roomId), await vault.getAddress(), ps[1])).to.be.rejected;
    // each player can verify what they paid
    const paid = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.getPaidHandle(roomId, ps[1].address), await vault.getAddress(), ps[1]);
    expect(paid).to.eq(STAKE);
    expect(await vault.token()).to.eq(await token.getAddress());
  });

  it("CREW wins: the pot (300) is split between the two crewmates (150 each); the spy loses the stake", async () => {
    const { vault, game, token, ps } = await setup(3);
    const roomId = await stakedRoom(game, ps);
    await game.connect(ps[0]).startGame(roomId, GAS);
    const { spy, crew } = await splitRoles(game, roomId, ps);
    for (const c of crew) for (let i = 0; i < 3; i++) await game.connect(c).completeTask(roomId, GAS);
    await checkpoint(game, roomId, ps[0]);
    expect((await game.getRoom(roomId)).winner).to.eq(Winner.Crewmates);

    await expect(vault.connect(crew[0]).claimPayout(roomId)).to.be.revertedWith("Not settled");
    await settle(game, roomId, 3, ps[0]);
    expect((await game.getStakeInfo(roomId)).winnersCount).to.eq(2);
    await expect(vault.connect(spy).claimPayout(roomId)).to.be.revertedWith("Not a winner");
    for (const c of crew) await vault.connect(c).claimPayout(roomId, GAS);
    await expect(vault.connect(crew[0]).claimPayout(roomId)).to.be.revertedWith("Already claimed");
    for (const c of crew) expect(await balanceOf(token, c)).to.eq(1050n);
    expect(await balanceOf(token, spy)).to.eq(900n);
  });

  it("SPY wins: the spy takes the whole pot (300)", async () => {
    const { vault, game, token, ps } = await setup(3);
    const roomId = await stakedRoom(game, ps);
    await game.connect(ps[0]).startGame(roomId, GAS);
    const { spy, crew } = await splitRoles(game, roomId, ps);
    const [h, proof] = await enc8(game, spy, ps.indexOf(crew[0]));
    await game.connect(spy).executeSecretKill(roomId, h, proof, GAS);
    await checkpoint(game, roomId, spy);
    expect((await game.getRoom(roomId)).winner).to.eq(Winner.Impostors);
    await settle(game, roomId, 3, spy);
    await vault.connect(spy).claimPayout(roomId, GAS);
    expect(await balanceOf(token, spy)).to.eq(1200n);
    for (const c of crew) expect(await balanceOf(token, c)).to.eq(900n);
  });

  it("settleRoom needs revealRoles first and rejects tampered role cleartexts (nobody can pick the winners)", async () => {
    const { vault, game, ps } = await setup(3);
    const roomId = await stakedRoom(game, ps);
    await game.connect(ps[0]).startGame(roomId, GAS);
    const { spy, crew } = await splitRoles(game, roomId, ps);
    const [h, proof] = await enc8(game, spy, ps.indexOf(crew[0]));
    await game.connect(spy).executeSecretKill(roomId, h, proof, GAS);
    await checkpoint(game, roomId, spy);
    await expect(game.connect(spy).settleRoom(roomId, "0x", "0x")).to.be.revertedWith("Call revealRoles first");
    const d = await revealAndDecrypt(game, roomId, spy, 3);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "uint256"], [1, 1, 1]);   // "everyone is the spy"
    await expect(game.connect(crew[1]).settleRoom(roomId, forged, d.decryptionProof)).to.be.reverted;
    await game.connect(crew[1]).settleRoom(roomId, d.abiEncodedClearValues, d.decryptionProof);
    await expect(game.connect(crew[1]).settleRoom(roomId, d.abiEncodedClearValues, d.decryptionProof)).to.be.revertedWith("Already settled");
  });

  it("an under-funded player cannot free-ride: their stake transfer silently pays 0, and a win pays them 0", async () => {
    const { vault, game, token, ps } = await setup(3, [1000n, 1000n, 50n]);   // player 3 cannot afford 100
    const roomId = await stakedRoom(game, ps);
    expect(await balanceOf(token, ps[2])).to.eq(50n);                   // nothing was taken
    const paid = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.getPaidHandle(roomId, ps[2].address), await vault.getAddress(), ps[2]);
    expect(paid).to.eq(0n);
    await game.connect(ps[0]).startGame(roomId, GAS);
    const { spy, crew } = await splitRoles(game, roomId, ps);
    for (const c of crew) for (let i = 0; i < 3; i++) await game.connect(c).completeTask(roomId, GAS);
    await checkpoint(game, roomId, ps[0]);
    await settle(game, roomId, 3, ps[0]);
    const before = await balanceOf(token, ps[2]);
    if (crew.includes(ps[2])) {
      await vault.connect(ps[2]).claimPayout(roomId, GAS);
      expect(await balanceOf(token, ps[2])).to.eq(before);              // claimed 0
    } else {
      expect(spy.address).to.eq(ps[2].address);                          // the poor player was the spy and lost: nothing to claim
    }
  });

  describe("cancel / refund / stalled game", () => {
    it("host cancels an unstarted lobby; everyone claims back exactly what they paid, once", async () => {
      const { vault, game, token, ps } = await setup(3);
      const roomId = await stakedRoom(game, ps);
      await expect(game.connect(ps[1]).cancelRoom(roomId)).to.be.revertedWith("Only host (or after timeout)");
      await expect(game.connect(ps[0]).cancelRoom(roomId)).to.emit(game, "RoomCancelled");
      expect((await game.getRoom(roomId)).phase).to.eq(Phase.Cancelled);
      for (const p of ps) await vault.connect(p).claimRefund(roomId, GAS);
      for (const p of ps) expect(await balanceOf(token, p)).to.eq(1000n);
      await expect(vault.connect(ps[1]).claimRefund(roomId)).to.be.revertedWith("Already claimed");
    });

    it("anyone can cancel a forgotten lobby after the timeout", async () => {
      const { vault, game, ps, signers } = await setup(3);
      const roomId = await stakedRoom(game, ps);
      await ethers.provider.send("evm_increaseTime", [86401]); await ethers.provider.send("evm_mine", []);
      await game.connect(signers[7]).cancelRoom(roomId);
      expect((await game.getRoom(roomId)).phase).to.eq(Phase.Cancelled);
    });

    it("a stalled running game is aborted after the timeout and refunded; not before", async () => {
      const { vault, game, token, ps, signers } = await setup(3);
      const roomId = await stakedRoom(game, ps);
      await game.connect(ps[0]).startGame(roomId, GAS);
      await expect(game.connect(signers[7]).abortStalled(roomId)).to.be.revertedWith("Too early");
      await ethers.provider.send("evm_increaseTime", [2 * 86400 + 1]); await ethers.provider.send("evm_mine", []);
      await game.connect(signers[7]).abortStalled(roomId);
      for (const p of ps) await vault.connect(p).claimRefund(roomId, GAS);
      for (const p of ps) expect(await balanceOf(token, p)).to.eq(1000n);
    });

    it("free rooms cannot be cancelled/aborted through the stake paths", async () => {
      const { game, signers } = await deployAll(true);
      await game.connect(signers[0]).createRoom(false);
      await expect(game.connect(signers[0]).cancelRoom(await game.roomCount())).to.be.revertedWith("Not a staked room");
    });
  });
});
