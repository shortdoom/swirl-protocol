import { ethers, utils } from "ethers";
import { task, types } from "hardhat/config";
import { CHAINLINK_GAS_CALCULATOR, DCA_POOL_FACTORY } from "../../deployment/contract-names";
import { ChainLinkGasCalculator, DcaPoolFactory, Erc20 } from "../../typechain";
import { TASK_ENABLE_ORDER_TOKEN } from "../task-names";
import { deployedContract } from "../../utils/deployment";

task(TASK_ENABLE_ORDER_TOKEN, "Enables an order token for the DCA protocol")
  .addParam("address", "Token address", null, types.string)
  .addOptionalParam("feed", "Chainlink feed address for the pair ETH/TOKEN", "", types.string)
  .addOptionalParam("ethIsBase", "True is the pair starts with ETH (e.g. ETH/USD)", false, types.boolean)
  .setAction(
    async ({ feed, address, ethIsBase }, hre): Promise<void> => {
      const mainnet = hre.network.config.chainId === 1;

      if (mainnet && !utils.isAddress(feed))
        throw new Error("A valid feed address must be specified for mainnet deployments");

      console.log(`Enabling token: ${address}`);
      const normalizedTokenAddress = ethers.utils.getAddress(address);
      const factory: DcaPoolFactory = await deployedContract(hre, DCA_POOL_FACTORY);

      console.log("Enabling order token in factory");
      await factory.enableOrderToken(normalizedTokenAddress);

      if (mainnet) {
        const token: Erc20 = await deployedContract(hre, "ERC20", normalizedTokenAddress);
        const normalizedFeedAddress = ethers.utils.getAddress(feed);
        const gasCalculator: ChainLinkGasCalculator = await deployedContract(hre, CHAINLINK_GAS_CALCULATOR);
        console.log("Retrieving token's decimals");
        const decimals: number = await token.decimals();
        console.log("Decimals for token:", decimals);
        console.log("Enabling order token in gas calculator");
        const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
        if (ethIsBase) {
          await gasCalculator.addFeed(ethAddress, normalizedTokenAddress, normalizedFeedAddress, 18, decimals);
        } else {
          await gasCalculator.addFeed(normalizedTokenAddress, ethAddress, normalizedFeedAddress, decimals, 18);
        }
      }
    },
  );
