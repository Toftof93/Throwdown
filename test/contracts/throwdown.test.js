const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const pmArtifact = require("@uniswap/v4-core/out/PoolManager.sol/PoolManager.json");

const E = ethers.parseEther;
const FLAGS = (1n << 13n) | (1n << 7n) | (1n << 6n);
const DAY = 86400;
const tickFor = (ethPerToken) => Math.floor(Math.log(ethPerToken) / Math.log(1.0001));
const plain = (r) => ({ currency0: r[0], currency1: r[1], fee: r[2], tickSpacing: r[3], hooks: r[4] });
const deadline = async () => (await time.latest()) + 3600;
const params = (o = {}) => ({ name: "Cats", symbol: "CATS", meta: "{}", creatorBps: 0, lockDays: 0, ...o });
const parse = (c, rc, name) => rc.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).filter((e) => e?.name === name);

async function deploy() {
  const s = await ethers.getSigners();
  const [owner, treasury] = s;
  // Start the clock early in a round so launches don't spill into the next one.
  const now = await time.latest();
  await time.increaseTo(Math.ceil((now + 1) / DAY) * DAY + 3600);
  const pm = await new ethers.ContractFactory(pmArtifact.abi, pmArtifact.bytecode.object, owner).deploy(owner.address);
  const deployer = await (await ethers.getContractFactory("ThrowDeployer")).deploy();
  const factory = await (await ethers.getContractFactory("ThrowdownFactory")).deploy(await pm.getAddress(), await deployer.getAddress(), owner.address, treasury.address, tickFor(1e-9));
  const initHash = await deployer.hookInitCodeHash(await pm.getAddress(), await factory.getAddress());
  let salt;
  for (let i = 0n; ; i++) {
    salt = ethers.toBeHex(i, 32);
    if ((BigInt(ethers.getCreate2Address(await deployer.getAddress(), salt, initHash)) & 0x3fffn) === FLAGS) break;
  }
  const hookAddr = ethers.getCreate2Address(await deployer.getAddress(), salt, initHash);
  await deployer.deployHook(salt, await pm.getAddress(), await factory.getAddress());
  await factory.setHook(hookAddr);
  const hook = await ethers.getContractAt("ThrowHook", hookAddr);
  const router = await (await ethers.getContractFactory("ThrowRouter")).deploy(await pm.getAddress());
  return { pm, factory, hook, router, deployer, owner, treasury, s };
}

async function launch(factory, signer, o = {}, value = 0n) {
  const rc = await (await factory.connect(signer).launch(params(o), { value })).wait();
  const ev = parse(factory, rc, "Launched")[0];
  return { token: await ethers.getContractAt("ThrowToken", ev.args.token), ev };
}

async function buy(router, factory, token, who, eth) {
  const key = plain(await factory.poolKey(await token.getAddress()));
  await router.connect(who).swap(key, true, eth, 0, who.address, await deadline(), { value: eth });
}

async function sell(router, factory, token, who, amount) {
  const key = plain(await factory.poolKey(await token.getAddress()));
  await token.connect(who).approve(await router.getAddress(), amount);
  await router.connect(who).swap(key, false, amount, 0, who.address, await deadline());
}

const poolId = async (factory, token) => {
  const k = plain(await factory.poolKey(await token.getAddress()));
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]));
};

describe("Throwdown", () => {
  it("launches into the Arena, blocks trading until the open, and taxes snipers", async () => {
    const { factory, router, s } = await deploy();
    const [, , alice, bob, carol] = s;
    const { token, ev } = await launch(factory, alice);
    expect(ev.args.round).to.equal(BigInt(Math.floor(Number(ev.args.openAt) / DAY)));
    await expect(buy(router, factory, token, bob, E("0.1"))).to.be.reverted;
    await time.increaseTo(Number(ev.args.openAt));
    await buy(router, factory, token, bob, E("0.1"));
    await time.increase(200);
    await buy(router, factory, token, carol, E("0.1"));
    expect(await token.balanceOf(carol.address)).to.be.gt((await token.balanceOf(bob.address)) * 15n / 10n);
  });

  it("puts coins that open late in a round into the next one", async () => {
    const { factory, s } = await deploy();
    const now = await time.latest();
    await time.increaseTo(Math.ceil(now / DAY) * DAY - 3 * 3600); // 3 hours before the round ends
    const { ev } = await launch(factory, s[2]);
    expect(ev.args.round).to.equal(BigInt(Math.floor(Number(ev.args.openAt) / DAY) + 1));
  });

  it("scores net ETH in, so round trips count for almost nothing", async () => {
    const { factory, router, hook, s } = await deploy();
    const [, , a, b, c, x] = s;
    const A = (await launch(factory, a, { symbol: "A" })).token;
    const B = (await launch(factory, b, { symbol: "B" })).token;
    const C = (await launch(factory, c, { symbol: "C" })).token;
    await time.increase(600);
    await buy(router, factory, A, x, E("1"));
    await buy(router, factory, B, x, E("0.5"));
    await buy(router, factory, C, x, E("3"));
    await sell(router, factory, C, x, await C.balanceOf(x.address));
    const [na] = await hook.scores(await poolId(factory, A));
    const [nb] = await hook.scores(await poolId(factory, B));
    const [nc] = await hook.scores(await poolId(factory, C));
    expect(na).to.equal(E("1"));
    expect(nb).to.equal(E("0.5"));
    expect(nc).to.be.lt(E("0.2")); // 3 ETH of volume, but only the fees stayed in
  });

  it("feeds the prize pool, pays out by pull, and settles the round's top three with buybacks", async () => {
    const { factory, router, s, treasury } = await deploy();
    const [, , a, b, c, d, x] = s;
    const A = (await launch(factory, a, { symbol: "A" })).token;
    const B = (await launch(factory, b, { symbol: "B" })).token;
    const C = (await launch(factory, c, { symbol: "C" })).token;
    const D = (await launch(factory, d, { symbol: "D" })).token;
    await time.increase(600);
    await buy(router, factory, A, x, E("2"));
    await buy(router, factory, B, x, E("1"));
    await buy(router, factory, C, x, E("0.5"));
    await buy(router, factory, D, x, E("0.1"));
    const round = Number((await factory.coins(await A.getAddress())).round);
    const all = [A, B, C, D].map((t) => t.target);
    await expect(factory.settleRound(round)).to.be.revertedWithCustomError(factory, "NotOver");
    await factory.claimMany(all);
    const [pool] = await factory.rounds(round);
    expect(pool).to.be.closeTo(E("0.0036"), E("0.0001")); // 10% of 1% of 3.6 ETH
    expect(await factory.pending(a.address)).to.be.closeTo(E("0.0144"), E("0.0002")); // 80% of 90% of 0.02
    expect(await factory.pending(treasury.address)).to.be.gt(0n);

    const before = await ethers.provider.getBalance(a.address);
    const rc = await (await factory.connect(a).withdraw()).wait();
    expect((await ethers.provider.getBalance(a.address)) - before + rc.gasUsed * rc.gasPrice).to.be.closeTo(E("0.0144"), E("0.0002"));
    await expect(factory.connect(a).withdraw()).to.be.revertedWithCustomError(factory, "NothingToWithdraw");

    await time.increaseTo((round + 1) * DAY);
    const supply = [await A.totalSupply(), await B.totalSupply(), await C.totalSupply()];
    const ev = parse(factory, await (await factory.settleRound(round)).wait(), "RoundSettled")[0];
    expect(ev.args.winners).to.deep.equal([A.target, B.target, C.target]);
    expect(ev.args.prizes[0]).to.equal((pool * 5000n) / 10000n);
    expect(ev.args.prizes[2]).to.equal((pool * 2000n) / 10000n);
    expect(await A.totalSupply()).to.equal(supply[0] - ev.args.burned[0]);
    expect(await C.totalSupply()).to.equal(supply[2] - ev.args.burned[2]);
    expect(ev.args.burned[0]).to.be.gt(0n);
    await expect(factory.settleRound(round)).to.be.revertedWithCustomError(factory, "AlreadySettled");
    // Later fees from those coins feed the running round instead.
    await buy(router, factory, A, x, E("1"));
    await factory.claim(A.target);
    const [next] = await factory.rounds(round + 1);
    expect(next).to.be.gt(0n);
  });

  it("runs a challenge: answer window, shared open, battle pot to the winner", async () => {
    const { factory, router, s } = await deploy();
    const [, , cats, dogs, late, x, y] = s;
    const rc = await (await factory.connect(cats).challenge(params(), "DOGS")).wait();
    const ch = parse(factory, rc, "Challenged")[0];
    const id = ch.args.battle;
    const A = await ethers.getContractAt("ThrowToken", ch.args.token);
    const rc2 = await (await factory.connect(dogs).answer(id, params({ name: "Dogs", symbol: "DOGS" }))).wait();
    const B = await ethers.getContractAt("ThrowToken", parse(factory, rc2, "Answered")[0].args.token);
    await expect(factory.connect(late).answer(id, params({ symbol: "X" }))).to.be.revertedWithCustomError(factory, "AlreadyAnswered");
    expect((await factory.coins(A.target)).openAt).to.equal((await factory.coins(B.target)).openAt);

    await time.increaseTo(Number(ch.args.start) + 300);
    await buy(router, factory, A, x, E("1"));
    await buy(router, factory, B, y, E("2"));
    await expect(factory.settleBattle(id)).to.be.revertedWithCustomError(factory, "NotOver");
    const ev1 = parse(factory, await (await factory.claim(B.target)).wait(), "FeesClaimed")[0];
    expect(ev1.args.battleEth).to.be.closeTo(E("0.004"), E("0.0002")); // 20% of 1% of 2 ETH

    await time.increaseTo(Number(ch.args.start) + DAY + 10);
    const supplyB = await B.totalSupply();
    const ev = parse(factory, await (await factory.settleBattle(id)).wait(), "BattleSettled")[0];
    expect(ev.args.winner).to.equal(B.target);
    expect(ev.args.pot).to.be.closeTo(E("0.006"), E("0.0003"));
    expect(await B.totalSupply()).to.equal(supplyB - ev.args.burned);
    await expect(factory.settleBattle(id)).to.be.revertedWithCustomError(factory, "AlreadySettled");
    // After the battle, fees no longer go to the pot.
    await buy(router, factory, A, x, E("1"));
    expect(parse(factory, await (await factory.claim(A.target)).wait(), "FeesClaimed")[0].args.battleEth).to.equal(0n);
  });

  it("closes answers at the open, and an unanswered challenge just trades in the Arena", async () => {
    const { factory, router, s } = await deploy();
    const [, , cats, dogs, x] = s;
    const rc = await (await factory.connect(cats).challenge(params(), "DOGS")).wait();
    const ch = parse(factory, rc, "Challenged")[0];
    await time.increaseTo(Number(ch.args.start));
    await expect(factory.connect(dogs).answer(ch.args.battle, params({ symbol: "DOGS" }))).to.be.revertedWithCustomError(factory, "AnswerClosed");
    const A = await ethers.getContractAt("ThrowToken", ch.args.token);
    await time.increase(200);
    await buy(router, factory, A, x, E("1"));
    expect(parse(factory, await (await factory.claim(A.target)).wait(), "FeesClaimed")[0].args.battleEth).to.equal(0n);
    await expect(factory.settleBattle(ch.args.battle)).to.be.revertedWithCustomError(factory, "NoBattle");
  });

  it("refunds a kept bond and burns with a broken one", async () => {
    const { factory, router, s } = await deploy();
    const [, , honest, rugger, x, y] = s;
    await expect(factory.connect(honest).launch(params(), { value: E("0.001") })).to.be.revertedWithCustomError(factory, "BondTooSmall");
    const H = (await launch(factory, honest, { symbol: "H", creatorBps: 500 }, E("0.2"))).token;
    const R = (await launch(factory, rugger, { symbol: "R", creatorBps: 500 }, E("0.3"))).token;
    expect(await H.bondedCreator()).to.equal(honest.address);
    await time.increase(600);
    await buy(router, factory, R, x, E("1"));
    // The rugger sells their allocation: the bond breaks.
    await sell(router, factory, R, rugger, await R.balanceOf(rugger.address));
    expect(await R.bondBroken()).to.equal(true);
    const supply = await R.totalSupply();
    const ev = parse(factory, await (await factory.connect(y).settleBond(R.target)).wait(), "BondSettled")[0];
    expect(ev.args.broken).to.equal(true);
    expect(await R.totalSupply()).to.equal(supply - ev.args.burned);
    await expect(factory.settleBond(R.target)).to.be.revertedWithCustomError(factory, "NoBond");

    await expect(factory.settleBond(H.target)).to.be.revertedWithCustomError(factory, "BondRunning");
    await time.increase(31 * DAY);
    await factory.connect(y).settleBond(H.target);
    expect(await factory.pending(honest.address)).to.equal(E("0.2"));
    // Moving coins after the bond ends doesn't matter.
    await H.connect(honest).transfer(y.address, 1n);
    expect(await H.bondBroken()).to.equal(false);
  });

  it("keeps owner powers capped and creator controls to the creator", async () => {
    const { factory, hook, deployer, pm, owner, s } = await deploy();
    const [, , alice, bob] = s;
    await expect(factory.setProtocolBps(3001)).to.be.revertedWithCustomError(factory, "BadBps");
    await expect(factory.connect(alice).setProtocolBps(0)).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    await expect(factory.setMinLead(2 * 3600)).to.be.revertedWithCustomError(factory, "BadLead");
    await expect(factory.setHook(await hook.getAddress())).to.be.revertedWithCustomError(factory, "HookExists");
    await expect(hook.setCard(ethers.ZeroHash, 0, 0, 0)).to.be.revertedWithCustomError(hook, "NotFactory");
    const key = { currency0: ethers.ZeroAddress, currency1: alice.address, fee: 0x800000, tickSpacing: 200, hooks: await hook.getAddress() };
    await expect(pm.connect(owner).initialize(key, 2n ** 96n)).to.be.reverted;
    await expect(factory.connect(alice).launch(params({ creatorBps: 1001 }))).to.be.revertedWithCustomError(factory, "TooMuchForCreator");
    await expect(factory.connect(alice).challenge(params(), "")).to.be.revertedWithCustomError(factory, "BadName");
    const { token } = await launch(factory, alice, { creatorBps: 300, lockDays: 7 });
    await expect(factory.unlock(token.target)).to.be.revertedWithCustomError(factory, "StillLocked");
    await expect(factory.connect(bob).setMeta(token.target, "{}")).to.be.revertedWithCustomError(factory, "NotCreator");
    await factory.connect(alice).setMeta(token.target, '{"x":"https://x.com/a"}');
    await time.increase(8 * DAY);
    await factory.connect(bob).unlock(token.target);
    expect(await token.balanceOf(alice.address)).to.equal(E("30000000"));
  });
});
