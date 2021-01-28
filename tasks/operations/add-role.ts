import { ethers } from "ethers";
import { task, types } from "hardhat/config";
import {
  CHAINLINK_GAS_CALCULATOR,
  DCA_POOL_FACADE,
  DCA_POOL_FACTORY,
  DCA_SCHEDULER,
  ONE_INCH_BUY_STRATEGY,
} from "../../deployment/contract-names";
import {
  ChainLinkGasCalculator,
  DcaPoolFacade,
  DcaPoolFactory,
  DcaScheduler,
  OneInchBuyStrategy,
} from "../../typechain";
import { Role } from "../../types/types";
import { deployedContract } from "../../utils/deployment";
import { TASK_ADD_ROLE } from "../task-names";

task(TASK_ADD_ROLE, "Add address as role")
  .addParam("address", "Account address", null, types.string)
  .addParam("role", "Roles: " + Object.values(Role).filter(v => typeof v === "string"), "", types.string)
  .setAction(
    async ({ address, role }, hre): Promise<void> => {
      if (!(role in Role)) {
        throw new Error("Invalid enum value");
      }
      const mainnet = hre.network.config.chainId === 1;

      const facade: DcaPoolFacade = await deployedContract(hre, DCA_POOL_FACADE);
      const scheduler: DcaScheduler = await deployedContract(hre, DCA_SCHEDULER);

      const normalizedAddress = ethers.utils.getAddress(address);

      switch (role) {
        case Role.ADMIN:
          const factory: DcaPoolFactory = await deployedContract(hre, DCA_POOL_FACTORY);
          console.log("Adding admin to factory");
          await factory.addAdmin(normalizedAddress);

          console.log("Adding admin to façade");
          await facade.addAdmin(normalizedAddress);

          console.log("Adding admin to scheduler");
          await scheduler.addAdmin(normalizedAddress);
          if (mainnet) {
            const gasCalculator: ChainLinkGasCalculator = await deployedContract(hre, CHAINLINK_GAS_CALCULATOR);
            const buyStrategy: OneInchBuyStrategy = await deployedContract(hre, ONE_INCH_BUY_STRATEGY);

            console.log("Adding admin to gas calculator");
            await gasCalculator.addAdmin(normalizedAddress);

            console.log("Adding admin to buy strategy");
            await buyStrategy.addAdmin(normalizedAddress);
          }
          break;
        case Role.EXECUTOR:
          console.log("Adding executor to façade");
          await facade.addExecutor(normalizedAddress);
          break;
        default:
          console.log("No actions taken with role", role);
      }
    },
  );
