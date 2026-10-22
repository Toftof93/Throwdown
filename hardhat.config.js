require("@nomicfoundation/hardhat-toolbox");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.28";

// Use the solc-js compiler from node_modules so builds work offline.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async ({ solcVersion }, hre, runSuper) => {
  if (solcVersion !== SOLC_VERSION) return runSuper();
  const solc = require("solc");
  return { compilerPath: require.resolve("solc/soljson.js"), isSolcJs: true, version: solcVersion, longVersion: solc.version() };
});

module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: { evmVersion: "cancun", viaIR: true, optimizer: { enabled: true, runs: 1000 } },
  },
  paths: { sources: "./contracts", tests: "./test/contracts" },
  networks: { hardhat: { hardfork: "cancun" } },
};
