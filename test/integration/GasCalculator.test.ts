import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { CHAINLINK_GAS_CALCULATOR } from "../../deployment/contract-names";
import { ChainLinkGasCalculator } from "../../typechain";
import {
  deployContract,
  ETH,
  ETH_DECIMALS,
  resetFork,
  USDC,
  USDC_DECIMALS,
  USDC_ETH_PRICE_FEED,
} from "../utils/integration";

describe("Gas Calculator", function () {
  let myWallet: Signer;
  let myWalletAddress: string;
  let gasCalculator: ChainLinkGasCalculator;
  beforeEach(async () => {
    await resetFork();
    [myWallet] = await ethers.getSigners();
    myWalletAddress = await myWallet.getAddress();
    gasCalculator = await deployContract(CHAINLINK_GAS_CALCULATOR);
    await gasCalculator.addFeed(USDC, ETH, USDC_ETH_PRICE_FEED, USDC_DECIMALS, ETH_DECIMALS);
  });

  describe("Gas calculations", function () {
    it("Calculates gas cost in USDC", async function () {
      const gasCostInUSDC = await gasCalculator.calculateTokenForGas(USDC, 21000);
      // Amount is fixed based on pinned block number
      expect(gasCostInUSDC.toNumber()).to.be.greaterThan(1567553);
    });
  });
});
