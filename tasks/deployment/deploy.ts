import { Contract, utils } from "ethers";
import { task, types } from "hardhat/config";
import {
  CHAINLINK_GAS_CALCULATOR,
  DCA_POOL_FACADE,
  DCA_POOL_FACTORY,
  DCA_SCHEDULER,
  MOCK_BUY_STRATEGY,
  MOCK_GAS_CALCULATOR,
  ONE_INCH_BUY_STRATEGY,
} from "../../deployment/contract-names";
import { ChainLinkGasCalculator, DcaPoolFactory, OneInchBuyStrategy } from "../../typechain";
import { deploySingletonContract } from "../../utils/deployment";
import { TASK_DEPLOY } from "../task-names";

task(TASK_DEPLOY, "Deploys all contracts for the DCA protocol")
  .addParam("executor", "Address of the executor account", null, types.string)
  .addOptionalParam("force", "Overwrite existing contracts", false, types.boolean)
  .addOptionalParam("admin", "Address of the admin account", "", types.string)
  .setAction(
    async ({ force, admin, executor }, hre): Promise<void> => {
      async function deployTestnet() {
        console.log("Deploying testnet factory");

        const buyStrategy: Contract = await deploySingletonContract(hre, force, MOCK_BUY_STRATEGY);
        const gasCalculator: Contract = await deploySingletonContract(hre, force, MOCK_GAS_CALCULATOR);
        const scheduler = await deploySingletonContract(hre, force, DCA_SCHEDULER, [gasCalculator.address]);
        const facade = await deploySingletonContract(hre, force, DCA_POOL_FACADE, [scheduler.address]);
        const factory = await deploySingletonContract(hre, force, DCA_POOL_FACTORY, [
          buyStrategy.address,
          gasCalculator.address,
          facade.address,
          scheduler.address,
        ]);
        console.log("Adding executor: ", executor);
        await facade.addExecutor(executor);

        console.log("Adding factory as registrar");
        await facade.addRegistrar(factory.address);

        console.log("Adding factory as scheduler's admin");
        await scheduler.addAdmin(factory.address);

        console.log("Adding façade as scheduler's executor: ", facade.address);
        await scheduler.addExecutor(facade.address);
      }

      async function deployMainnet() {
        console.log("Deploying mainnet factory");

        const buyStrategy: OneInchBuyStrategy = await deploySingletonContract(hre, force, ONE_INCH_BUY_STRATEGY);
        const gasCalculator: ChainLinkGasCalculator = await deploySingletonContract(
          hre,
          force,
          CHAINLINK_GAS_CALCULATOR,
        );
        const scheduler = await deploySingletonContract(hre, force, DCA_SCHEDULER, [gasCalculator.address]);
        const facade = await deploySingletonContract(hre, force, DCA_POOL_FACADE, [scheduler.address]);
        const factory: DcaPoolFactory = await deploySingletonContract(hre, force, DCA_POOL_FACTORY, [
          buyStrategy.address,
          gasCalculator.address,
          facade.address,
          scheduler.address,
        ]);

        if (admin) {
          await facade.addAdmin(admin);
          await factory.addAdmin(admin);
          await gasCalculator.addAdmin(admin);
          await buyStrategy.addAdmin(admin);
          await scheduler.addAdmin(admin);
        }
        console.log("Adding executor: ", executor);
        await facade.addExecutor(executor);

        console.log("Adding factory as registrar");
        await facade.addRegistrar(factory.address);

        console.log("Adding factory as scheduler's admin");
        await scheduler.addAdmin(factory.address);

        console.log("Adding façade as scheduler's executor: ", facade.address);
        await scheduler.addExecutor(facade.address);
      }

      // Task starts here
      const mainnet = hre.network.config.chainId === 1;
      if (mainnet && !utils.isAddress(admin))
        throw new Error("A valid admin address must be specified for mainnet deployments");

      console.log(`Deployment Started. force = ${force} mainnet = ${mainnet} admin = ${admin}`);

      if (mainnet) {
        await deployMainnet();
      } else {
        await deployTestnet();
      }
    },
  );
