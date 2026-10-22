// Copies contract ABIs (and the bytecode the admin page deploys) into the web app.
const fs = require("fs");
const path = require("path");
const out = path.join(__dirname, "../src/lib/abi");
const art = (n) => require(`../artifacts/contracts/${n}.sol/${n}.json`);
for (const n of ["ThrowdownFactory", "ThrowRouter", "ThrowHook", "ThrowToken", "ThrowDeployer", "ThrowShowcase"]) {
  const a = art(n);
  const deployable = n !== "ThrowHook" && n !== "ThrowToken";
  fs.writeFileSync(path.join(out, `${n}.json`), JSON.stringify(deployable ? { abi: a.abi, bytecode: a.bytecode } : { abi: a.abi }));
}
// Uniswap's own PoolManager build, used only to stand up a test pool manager on testnet.
const pm = require("@uniswap/v4-core/out/PoolManager.sol/PoolManager.json");
fs.writeFileSync(path.join(out, "PoolManager.json"), JSON.stringify({ abi: pm.abi, bytecode: pm.bytecode.object }));
console.log("ABIs exported");
