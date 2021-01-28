import { ethers } from "ethers";
import { task, types } from "hardhat/config";
import { DCA_POOL_FACTORY, ONE_INCH_BUY_STRATEGY } from "../../deployment/contract-names";
import { DcaPoolFactory, OneInchBuyStrategy } from "../../typechain";
import { TASK_ENABLE_BASE_TOKEN } from "../task-names";
import { deployedContract } from "../../utils/deployment";

task(TASK_ENABLE_BASE_TOKEN, "Enables a base token for the DCA protocol")
  .addParam("address", "Token address", null, types.string)
  .setAction(
    async ({ address }, hre): Promise<void> => {
      const mainnet = hre.network.config.chainId === 1;
      const normalizedAddress = ethers.utils.getAddress(address);
      const factory: DcaPoolFactory = await deployedContract(hre, DCA_POOL_FACTORY);

      console.log("Enabling base token in factory");
      await factory.enableBaseToken(normalizedAddress);

      if (mainnet) {
        const buyStrategy: OneInchBuyStrategy = await deployedContract(hre, ONE_INCH_BUY_STRATEGY);
        console.log("Enabling sell token in buy strategy");
        await buyStrategy.enableSellToken(normalizedAddress);
      }
    },
  );
