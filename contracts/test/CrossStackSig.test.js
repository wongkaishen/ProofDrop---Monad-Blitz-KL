/*
 * Cross-stack signature test.
 *
 * Deploys the badge contract locally, then shells out to the Python signer
 * to produce an EIP-712 voucher signature. The test then submits that
 * signature on-chain and expects the badge to mint. This proves the Python
 * and Solidity sides agree on the EIP-712 domain + struct hash.
 *
 * Requires that the backend venv is installed (see backend/README.md).
 * Skipped automatically if Python or the venv can't be located.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BACKEND_DIR = path.resolve(__dirname, "..", "..", "backend");
const VENV_PY = path.join(BACKEND_DIR, ".venv", "bin", "python");
const HAS_VENV = fs.existsSync(VENV_PY);

(HAS_VENV ? describe : describe.skip)("cross-stack signature (Python ↔ Solidity)", function () {
  it("accepts a voucher signed by the Python backend", async () => {
    const [, recipient] = await ethers.getSigners();

    const pk = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
    const verifierAddr = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // address(pk)

    const Badge = await ethers.getContractFactory("ProofDropBadge");
    const badge = await Badge.deploy(verifierAddr);
    await badge.waitForDeployment();
    const badgeAddr = await badge.getAddress();
    const chainId = Number((await ethers.provider.getNetwork()).chainId);

    const questId = 7;
    const uri = "data:application/json,%7B%22n%22%3A1%7D";
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const script = `
import sys
sys.path.insert(0, "${BACKEND_DIR}")
from signer import Voucher, sign_voucher
v = Voucher(to="${recipient.address}", quest_id=${questId}, token_uri="${uri}", deadline=${deadline})
print(sign_voucher(v, private_key="${pk}", chain_id=${chainId}, contract_address="${badgeAddr}"))
`;
    const out = execFileSync(VENV_PY, ["-c", script], { encoding: "utf8" });
    const sig = out.trim();
    expect(sig).to.match(/^0x[0-9a-fA-F]{130}$/);

    await expect(
      badge
        .connect(recipient)
        .claimBadge(recipient.address, questId, uri, deadline, sig)
    ).to.emit(badge, "BadgeClaimed");

    expect(await badge.ownerOf(1)).to.equal(recipient.address);
  });
});
