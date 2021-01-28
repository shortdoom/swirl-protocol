import { expect } from "chai";
import { Contract, Signer, utils } from "ethers";
import { ethers } from "hardhat";
import ERC20ABI from "../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { ONE_INCH_BUY_STRATEGY } from "../../deployment/contract-names";
import { Erc20, OneInchBuyStrategy } from "../../typechain";
import {
  BTC_USD_PRICE_FEED,
  deployContract,
  renBTC,
  REN_BTC_DECIMALS,
  resetFork,
  sudo_TransferToken,
  USDC,
  USDC_DECIMALS,
  WBTC_USDC_WHALE,
} from "../utils/integration";

describe("1Inch integration", function () {
  let myWallet: Signer;
  let myWalletAddress: string;
  let renBTCContract: Erc20;
  let buyStrategy: OneInchBuyStrategy;
  beforeEach(async () => {
    await resetFork();
    [myWallet] = await ethers.getSigners();
    myWalletAddress = await myWallet.getAddress();
    await sudo_TransferToken(USDC, WBTC_USDC_WHALE, utils.parseUnits("100000000.0", USDC_DECIMALS), myWalletAddress);
    buyStrategy = await deployContract(ONE_INCH_BUY_STRATEGY);
    await buyStrategy.enableSellToken(USDC);
    await buyStrategy.addFeed(renBTC, USDC, BTC_USD_PRICE_FEED, REN_BTC_DECIMALS, USDC_DECIMALS);
    const usdcContract: Erc20 = new Contract(USDC, ERC20ABI.abi, myWallet) as Erc20;
    await usdcContract.approve(buyStrategy.address, utils.parseUnits("100000000.0", USDC_DECIMALS));
    renBTCContract = new Contract(renBTC, ERC20ABI.abi, myWallet) as Erc20;
  });

  describe("1Inch Strategy", function () {
    it("Buys ren btc", async function () {
      const amountoBuy = "10000.0";
      expect(await buyStrategy.canBuy(utils.parseUnits(amountoBuy, USDC_DECIMALS), USDC, renBTC)).to.be.true;

      await buyStrategy.buy(myWalletAddress, utils.parseUnits(amountoBuy, USDC_DECIMALS), USDC, renBTC);

      const amountBought = (await renBTCContract.balanceOf(myWalletAddress)).toNumber();
      // Amount is fixed based on pinned block number
      expect(amountBought).to.be.greaterThan(33184046);
    });

    it("Large order trips slippage circuit breaker", async function () {
      const amountoBuy = "90000000.0";
      expect(await buyStrategy.canBuy(utils.parseUnits(amountoBuy, USDC_DECIMALS), USDC, renBTC)).to.be.false;

      await expect(buyStrategy.buy(myWalletAddress, utils.parseUnits(amountoBuy, USDC_DECIMALS), USDC, renBTC)).to.emit(
        buyStrategy,
        "SlippageLimitBreached",
      );

      const amountBought = (await renBTCContract.balanceOf(myWalletAddress)).toNumber();
      // High slippage trips circuit breaker hence no swap
      expect(amountBought).to.be.equals(0);
    });
  });
});
