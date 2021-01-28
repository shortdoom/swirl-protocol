import { ethers } from "ethers";
import { task, types } from "hardhat/config";
import { DCA_POOL_FACTORY } from "../../deployment/contract-names";
import { DcaPoolFactory } from "../../typechain";
import { deployedContract } from "../../utils/deployment";
import { TASK_ADD_ROLE } from "../task-names";

task(TASK_ADD_ROLE, "Set buy strategy for token")
  .addParam("tokenAddress", "Order token address", null, types.string)
  .addParam("strategyAddress", "Buy strategy address", null, types.string)
  .setAction(
    async ({ tokenAddress, strategyAddress }, hre): Promise<void> => {
      const factory: DcaPoolFactory = await deployedContract(hre, DCA_POOL_FACTORY);
      const normalizedTokenAddress = ethers.utils.getAddress(tokenAddress);
      const normalizedStrategyAddress = ethers.utils.getAddress(strategyAddress);

      await factory.setBuyStrategy(normalizedTokenAddress, normalizedStrategyAddress);
    },
  );
