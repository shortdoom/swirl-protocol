import { ethers } from "ethers";
import { task, types } from "hardhat/config";
import { ONE_INCH_BUY_STRATEGY } from "../../deployment/contract-names";
import { OneInchBuyStrategy } from "../../typechain";
import { deployedContract } from "../../utils/deployment";
import { TASK_ENABLE_ORDER_TOKEN } from "../task-names";

task(TASK_ENABLE_ORDER_TOKEN, "Add price feed to buy strategy")
  .addParam("baseAddress", "Base token address", null, types.string)
  .addParam("baseDecimals", "Base token decimals", null, types.int)
  .addParam("quoteAddress", "Quote token address", null, types.string)
  .addParam("quoteDecimals", "Quote token decimlas", null, types.int)
  .addParam("feed", "Chainlink feed address for the pair", null, types.string)

  .setAction(
    async ({ feed, baseAddress, quoteAddress, baseDecimals, quoteDecimals }, hre): Promise<void> => {
      console.log(`Adding price feed. Base: ${baseAddress} Quote: ${quoteAddress} Feed: ${feed}`);
      const normalizedBaseAddress = ethers.utils.getAddress(baseAddress);
      const normalizedQuoteAddress = ethers.utils.getAddress(quoteAddress);
      const normalizedFeedAddress = ethers.utils.getAddress(feed);
      const buyStrategy: OneInchBuyStrategy = await deployedContract(hre, ONE_INCH_BUY_STRATEGY);
      await buyStrategy.addFeed(
        normalizedBaseAddress,
        normalizedQuoteAddress,
        normalizedFeedAddress,
        baseDecimals,
        quoteDecimals,
      );
    },
  );
