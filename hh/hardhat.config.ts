import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import { subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import type { HardhatUserConfig } from "hardhat/config";

/** Use the npm `solc` (solc-js) package instead of downloading a native compiler: works offline / behind an allowlist. */
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion !== "0.8.27") return runSuper();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const solc = require("solc");
  return { compilerPath: require.resolve("solc/soljson.js"), isSolcJs: true, version: "0.8.27", longVersion: solc.version() };
});

const config: HardhatUserConfig = {
  solidity: { version: "0.8.27", settings: { evmVersion: "cancun", viaIR: true, optimizer: { enabled: true, runs: 200 } } },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  mocha: { timeout: 900000 },
};
export default config;
