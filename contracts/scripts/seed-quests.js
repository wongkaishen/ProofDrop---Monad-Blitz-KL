const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const QUESTS = [
  {
    title: "Hello Monad",
    description:
      "Post a short message saying hello to the Monad community. Include the word 'monad' in your proof text.",
    imageURI: "ipfs://placeholder/hello-monad.png",
  },
  {
    title: "Coffee Streak",
    description:
      "Upload a photo of your coffee cup. Our AI checks for a cup-like image.",
    imageURI: "ipfs://placeholder/coffee.png",
  },
  {
    title: "Builder Selfie",
    description:
      "Submit a selfie at your workstation while building on Monad Blitz KL.",
    imageURI: "ipfs://placeholder/builder.png",
  },
];

async function main() {
  const deploymentPath = path.join(
    __dirname,
    "..",
    "deployments",
    `${hre.network.name}.json`
  );
  if (!fs.existsSync(deploymentPath)) {
    throw new Error("No deployment found for " + hre.network.name);
  }
  const dep = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const quest = await hre.ethers.getContractAt(
    "ProofDropQuest",
    dep.contracts.ProofDropQuest
  );

  for (const q of QUESTS) {
    const tx = await quest.createQuest(q.title, q.description, q.imageURI);
    const rcpt = await tx.wait();
    console.log("Created:", q.title, "tx:", rcpt.hash);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
