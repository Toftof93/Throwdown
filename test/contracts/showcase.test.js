const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ThrowShowcase", () => {
  let sc, owner, treasury, builder, fan, fan2;
  const e = ethers.parseEther;

  beforeEach(async () => {
    [owner, treasury, builder, fan, fan2] = await ethers.getSigners();
    sc = await (await ethers.getContractFactory("ThrowShowcase")).deploy(owner.address, treasury.address, 500);
  });

  it("lists a project and pays the builder minus the fee", async () => {
    await expect(sc.connect(builder).list("Moon App", '{"description":"An app"}')).to.emit(sc, "Listed").withArgs(1, builder.address, "Moon App", '{"description":"An app"}');
    expect(await sc.projectCount()).to.equal(1);
    await expect(sc.connect(fan).back(1, "go build", { value: e("1") })).to.emit(sc, "Backed");
    expect(await sc.pending(builder.address)).to.equal(e("0.95"));
    expect(await sc.pending(treasury.address)).to.equal(e("0.05"));
    const before = await ethers.provider.getBalance(builder.address);
    const rc = await (await sc.connect(builder).withdraw()).wait();
    const gas = rc.gasUsed * rc.gasPrice;
    expect(await ethers.provider.getBalance(builder.address)).to.equal(before + e("0.95") - gas);
    await expect(sc.connect(builder).withdraw()).to.be.revertedWithCustomError(sc, "NothingToWithdraw");
  });

  it("counts backers once and tracks daily and all-time totals", async () => {
    await sc.connect(builder).list("A", "");
    await sc.connect(fan).back(1, "", { value: e("0.1") });
    await sc.connect(fan).back(1, "", { value: e("0.2") });
    await sc.connect(fan2).back(1, "", { value: e("0.3") });
    let p = await sc.projects(1);
    expect(p.backers).to.equal(2);
    expect(p.raised).to.equal(e("0.6"));
    const d = await sc.today();
    expect(await sc.dayRaised(d, 1)).to.equal(e("0.6"));
    await time.increase(86400);
    await sc.connect(fan).back(1, "", { value: e("0.5") });
    expect(await sc.dayRaised(d + 1n, 1)).to.equal(e("0.5"));
    expect(await sc.dayRaised(d, 1)).to.equal(e("0.6"));
    expect(await sc.backed(1, fan.address)).to.equal(e("0.8"));
  });

  it("rejects bad input", async () => {
    await expect(sc.connect(builder).list("", "")).to.be.revertedWithCustomError(sc, "BadName");
    await sc.connect(builder).list("A", "");
    await expect(sc.connect(fan).back(2, "", { value: e("1") })).to.be.revertedWithCustomError(sc, "NoProject");
    await expect(sc.connect(fan).back(0, "", { value: e("1") })).to.be.revertedWithCustomError(sc, "NoProject");
    await expect(sc.connect(fan).back(1, "", { value: 1n })).to.be.revertedWithCustomError(sc, "TooSmall");
    await expect(sc.connect(fan).back(1, "x".repeat(141), { value: e("1") })).to.be.revertedWithCustomError(sc, "NoteTooLong");
  });

  it("lets only the builder edit, and moves future backing to a new address", async () => {
    await sc.connect(builder).list("A", "");
    await expect(sc.connect(fan).setMeta(1, "{}")).to.be.revertedWithCustomError(sc, "NotBuilder");
    await sc.connect(builder).setMeta(1, '{"x":"https://x.com/a"}');
    expect(await sc.meta(1)).to.equal('{"x":"https://x.com/a"}');
    await sc.connect(fan).back(1, "", { value: e("1") });
    await sc.connect(builder).setBuilder(1, fan2.address);
    await sc.connect(fan).back(1, "", { value: e("1") });
    expect(await sc.pending(builder.address)).to.equal(e("0.95"));
    expect(await sc.pending(fan2.address)).to.equal(e("0.95"));
    await expect(sc.connect(builder).setMeta(1, "{}")).to.be.revertedWithCustomError(sc, "NotBuilder");
  });

  it("owner can hide a listing and change the fee within the cap, but not take pending ETH", async () => {
    await sc.connect(builder).list("A", "");
    await sc.connect(fan).back(1, "", { value: e("1") });
    await expect(sc.connect(fan).setHidden(1, true)).to.be.revertedWithCustomError(sc, "OwnableUnauthorizedAccount");
    await sc.setHidden(1, true);
    await expect(sc.connect(fan).back(1, "", { value: e("1") })).to.be.revertedWithCustomError(sc, "Hidden");
    expect(await sc.pending(builder.address)).to.equal(e("0.95"));
    await expect(sc.setFeeBps(1001)).to.be.revertedWithCustomError(sc, "FeeTooHigh");
    await sc.setFeeBps(0);
    await sc.setHidden(1, false);
    await sc.connect(fan).back(1, "", { value: e("1") });
    expect(await sc.pending(builder.address)).to.equal(e("1.95"));
  });
});
