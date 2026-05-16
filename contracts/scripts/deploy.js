const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const verifierAddress = process.env.VERIFIER_ADDRESS || deployer.address;
  console.log("Verifier (backend signer):", verifierAddress);

  const Quest = await hre.ethers.getContractFactory("ProofDropQuest");
  const quest = await Quest.deploy();
  await quest.waitForDeployment();
  const questAddr = await quest.getAddress();
  console.log("ProofDropQuest:", questAddr);

  const Badge = await hre.ethers.getContractFactory("ProofDropBadge");
  const badge = await Badge.deploy(verifierAddress);
  await badge.waitForDeployment();
  const badgeAddr = await badge.getAddress();
  console.log("ProofDropBadge:", badgeAddr);

  const out = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    verifier: verifierAddress,
    contracts: {
      ProofDropQuest: questAddr,
      ProofDropBadge: badgeAddr,
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${hre.network.name}.json`),
    JSON.stringify(out, null, 2)
  );
  console.log("Saved deployment to deployments/" + hre.network.name + ".json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
