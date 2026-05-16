const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProofDrop", function () {
  let owner, verifier, alice;
  let badge, quest;

  beforeEach(async () => {
    [owner, verifier, alice] = await ethers.getSigners();

    const Quest = await ethers.getContractFactory("ProofDropQuest");
    quest = await Quest.deploy();
    await quest.waitForDeployment();

    const Badge = await ethers.getContractFactory("ProofDropBadge");
    badge = await Badge.deploy(verifier.address);
    await badge.waitForDeployment();
  });

  it("creates quests", async () => {
    await quest.createQuest("Hello", "say hi", "ipfs://x");
    const q = await quest.getQuest(1);
    expect(q.title).to.equal("Hello");
    expect(q.active).to.equal(true);
  });

  it("claims a badge with a valid voucher", async () => {
    const questId = 1n;
    const uri = "ipfs://badge/1.json";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "ProofDrop",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await badge.getAddress(),
    };
    const types = {
      ClaimVoucher: [
        { name: "to", type: "address" },
        { name: "questId", type: "uint256" },
        { name: "tokenURI", type: "string" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const value = { to: alice.address, questId, tokenURI: uri, deadline };
    const sig = await verifier.signTypedData(domain, types, value);

    await expect(
      badge.connect(alice).claimBadge(alice.address, questId, uri, deadline, sig)
    ).to.emit(badge, "BadgeClaimed");

    expect(await badge.ownerOf(1)).to.equal(alice.address);
    expect(await badge.tokenURI(1)).to.equal(uri);
    expect(await badge.claimed(questId, alice.address)).to.equal(true);
  });

  it("rejects a duplicate claim", async () => {
    const questId = 1n;
    const uri = "ipfs://badge/1.json";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "ProofDrop",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await badge.getAddress(),
    };
    const types = {
      ClaimVoucher: [
        { name: "to", type: "address" },
        { name: "questId", type: "uint256" },
        { name: "tokenURI", type: "string" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const value = { to: alice.address, questId, tokenURI: uri, deadline };
    const sig = await verifier.signTypedData(domain, types, value);

    await badge
      .connect(alice)
      .claimBadge(alice.address, questId, uri, deadline, sig);

    await expect(
      badge.connect(alice).claimBadge(alice.address, questId, uri, deadline, sig)
    ).to.be.revertedWith("already claimed");
  });

  it("rejects a bad signer", async () => {
    const questId = 1n;
    const uri = "ipfs://badge/1.json";
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "ProofDrop",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await badge.getAddress(),
    };
    const types = {
      ClaimVoucher: [
        { name: "to", type: "address" },
        { name: "questId", type: "uint256" },
        { name: "tokenURI", type: "string" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const value = { to: alice.address, questId, tokenURI: uri, deadline };
    const sig = await alice.signTypedData(domain, types, value);

    await expect(
      badge.connect(alice).claimBadge(alice.address, questId, uri, deadline, sig)
    ).to.be.revertedWith("bad signature");
  });
});
