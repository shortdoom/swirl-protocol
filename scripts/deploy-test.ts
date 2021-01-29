// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import { Contract, utils } from "ethers";
import hre, { ethers } from "hardhat";
import {
  DCA_POOL_FACADE,
  DCA_POOL_FACTORY,
  DCA_SCHEDULER,
  MOCK_BUY_STRATEGY,
  MOCK_ERC_20,
  MOCK_GAS_CALCULATOR,
} from "../deployment/contract-names";
import { DcaPoolFacade, Ierc20, MockBuyStrategy } from "../typechain";
import { deployContractInstance, deploySingletonContract } from "../utils/deployment";

async function main(): Promise<void> {
  console.log("Deployment Started.");
  const force = false;
  const buyStrategy: MockBuyStrategy = await deploySingletonContract(hre, force, MOCK_BUY_STRATEGY);
  const gasCalculator: Contract = await deploySingletonContract(hre, force, MOCK_GAS_CALCULATOR);
  const scheduler = await deploySingletonContract(hre, force, DCA_SCHEDULER, [gasCalculator.address]);
  const facade: DcaPoolFacade = await deploySingletonContract(hre, force, DCA_POOL_FACADE, [scheduler.address]);
  const baseToken1: Ierc20 = await deployContractInstance(hre, force, MOCK_ERC_20, "base1", ["Token1", "1ERC20"]);
  const baseToken2: Ierc20 = await deployContractInstance(hre, force, MOCK_ERC_20, "base2", ["Token2", "2ERC20"]);
  const baseToken3: Ierc20 = await deployContractInstance(hre, force, MOCK_ERC_20, "base3", ["Token3", "3ERC20"]);
  const orderToken1: Ierc20 = await deployContractInstance(hre, force, MOCK_ERC_20, "order1", ["Token4", "4ERC20"]);
  const orderToken2: Ierc20 = await deployContractInstance(hre, force, MOCK_ERC_20, "order2", ["Token5", "5ERC20"]);

  await buyStrategy.setAmounts(0, utils.parseEther("2.2"));
  const factory = await deploySingletonContract(hre, force, DCA_POOL_FACTORY, [
    buyStrategy.address,
    gasCalculator.address,
    facade.address,
    scheduler.address,
  ]);

  console.log("Adding factory as scheduler's admin");
  await scheduler.addAdmin(factory.address);

  console.log("Adding façade as scheduler's executor: ", facade.address);
  await scheduler.addExecutor(facade.address);

  const signers = await ethers.getSigners();
  await facade.addExecutor(signers[0].address);
  console.log("Adding factory as registrar");
  await facade.addRegistrar(factory.address);

  console.log("Enabling base token 1 in factory");
  await factory.enableBaseToken(baseToken1.address);
  console.log("Enabling base token 2 in factory");
  await factory.enableBaseToken(baseToken2.address);
  console.log("Enabling base token 3 in factory");
  await factory.enableBaseToken(baseToken3.address);
  console.log("Enabling order token 1 in factory");
  await factory.enableOrderToken(orderToken1.address);
  console.log("Enabling order token 2 in factory");
  await factory.enableOrderToken(orderToken2.address);

  console.log("Seeding strategy pool for order token 1");
  await orderToken1.transfer(buyStrategy.address, utils.parseEther("100.0"));
  console.log("Seeding strategy pool for order token 2");
  await orderToken2.transfer(buyStrategy.address, utils.parseEther("100.0"));

  console.log("Creating Pools");

  await createPools(baseToken1, orderToken1);
  await createPools(baseToken1, orderToken2);
  await createPools(baseToken2, orderToken1);
  await createPools(baseToken2, orderToken2);
  await createPools(baseToken3, orderToken1);
  await createPools(baseToken3, orderToken2);

  async function createPools(baseToken: Ierc20, orderToken: Ierc20) {
    for (const period in [1, 2, 3, 5]) {
      if (!isNaN(parseInt(period))) {
        console.log(`Creating Pool: B:${baseToken.address} O:${orderToken.address} P:${period}`);
        await factory.createPool(baseToken.address, orderToken.address, period, 10 ** 8);
      }
    }
  }
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
