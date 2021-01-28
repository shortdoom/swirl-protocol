import { expect } from "chai";
import { BigNumber, constants, Contract, Signer, utils } from "ethers";
import { ethers } from "hardhat";
import ERC20ABI from "../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import {
  CHAINLINK_GAS_CALCULATOR,
  DCA_POOL_FACADE,
  DCA_POOL_FACTORY,
  DCA_SCHEDULER,
  DCA_VAULT,
  ONE_INCH_BUY_STRATEGY,
} from "../../deployment/contract-names";
import { DcaPoolFacade, DcaPoolFactory, DcaScheduler, DcaVault, Erc20, OneInchBuyStrategy } from "../../typechain";
import { Period } from "../../types/types";
import {
  BTC_ETH_PRICE_FEED,
  BTC_USD_PRICE_FEED,
  deployContract,
  ETH,
  ETH_DECIMALS,
  renBTC,
  REN_BTC_DECIMALS,
  resetFork,
  sudo_TransferToken,
  USDC,
  USDC_DECIMALS,
  wBTC,
  WBTC_DECIMALS,
  WBTC_USDC_WHALE,
  WETH,
} from "../utils/integration";
import { advanceBlockAtTime, deployedContract, getCurrentTimeStamp } from "../utils/utils";

const DEFAULT_CHAIN_ID = 1;

describe("Pool End To End", function () {
  let myWallet: Signer;
  let executorWallet: Signer;
  let myWalletAddress: string;
  let executorWalletAddress: string;
  let usdcContract: Erc20;
  let renBTCContract: Erc20;
  let wethContract: Erc20;
  let facade: DcaPoolFacade;
  let vault1: DcaVault;
  let vault2: DcaVault;
  beforeEach(async () => {
    await resetFork();

    // Init address and balances
    [myWallet, executorWallet] = await ethers.getSigners();
    myWalletAddress = await myWallet.getAddress();
    await sudo_TransferToken(USDC, WBTC_USDC_WHALE, utils.parseUnits("100000000.0", USDC_DECIMALS), myWalletAddress);
    await sudo_TransferToken(wBTC, WBTC_USDC_WHALE, utils.parseUnits("100.0", WBTC_DECIMALS), myWalletAddress);
    renBTCContract = new Contract(renBTC, ERC20ABI.abi, myWallet) as Erc20;
    wethContract = new Contract(WETH, ERC20ABI.abi, myWallet) as Erc20;

    // Init Buy Strategy
    const buyStrategy: OneInchBuyStrategy = await deployContract(ONE_INCH_BUY_STRATEGY);
    await buyStrategy.enableSellToken(USDC);
    await buyStrategy.enableSellToken(wBTC);
    await buyStrategy.addFeed(renBTC, USDC, BTC_USD_PRICE_FEED, REN_BTC_DECIMALS, USDC_DECIMALS);

    // Init Gas Calculator
    const gasCalculator: Contract = await deployContract(CHAINLINK_GAS_CALCULATOR);
    await gasCalculator.addFeed(renBTC, ETH, BTC_ETH_PRICE_FEED, REN_BTC_DECIMALS, ETH_DECIMALS);

    const scheduler: DcaScheduler = await deployContract(DCA_SCHEDULER, [gasCalculator.address]);
    // Init Façade
    facade = await deployContract(DCA_POOL_FACADE, [scheduler.address]);
    await facade.addExecutor(myWalletAddress);

    // Init Factory
    const factory: DcaPoolFactory = await deployContract(DCA_POOL_FACTORY, [
      buyStrategy.address,
      gasCalculator.address,
      facade.address,
      scheduler.address,
    ]);
    await facade.addRegistrar(factory.address);
    await scheduler.addAdmin(factory.address);
    // Enable Tokens
    await factory.enableBaseToken(USDC);
    await factory.enableBaseToken(wBTC);
    await factory.enableOrderToken(renBTC);
    await factory.enableOrderToken(WETH);

    //Init pools
    await factory.createPool(USDC, renBTC, Period.HOURLY, 1);
    await factory.createPool(wBTC, WETH, Period.DAILY, 1);
    //Create Accounts
    const vaultAddress1 = await facade.getPool(USDC, renBTC, Period.HOURLY);
    const vaultAddress2 = await facade.getPool(wBTC, WETH, Period.DAILY);
    usdcContract = new Contract(USDC, ERC20ABI.abi, myWallet) as Erc20;
    const wbtcContract = new Contract(wBTC, ERC20ABI.abi, myWallet) as Erc20;
    await usdcContract.approve(vaultAddress1, utils.parseUnits("10000000.0", USDC_DECIMALS));
    await wbtcContract.approve(vaultAddress2, utils.parseUnits("1000.0", WBTC_DECIMALS));
    vault1 = await deployedContract(DCA_VAULT, vaultAddress1);
    vault2 = await deployedContract(DCA_VAULT, vaultAddress2);
    await vault1.createAccount(utils.parseUnits("1000.0", USDC_DECIMALS), 2);
    await vault2.createAccount(utils.parseUnits("1.0", WBTC_DECIMALS), 2);
    // Set up fees
    executorWalletAddress = await executorWallet.getAddress();
    await scheduler.setFeesRecipient(executorWalletAddress);
    await scheduler.addExecutor(facade.address);
    await scheduler.setFeesInBPS(30);
  });

  describe("Purchases", function () {
    it("Succeeds on the first evaluation", async function () {
      const readyPools = await facade.readyPools();
      expect(readyPools.filter(isNonZeroAddress).length).to.be.equals(2);
      await facade.evaluatePoolsAsExecutor(readyPools, { gasLimit: 9500000 });
      await vault1.withdraw();
      await vault2.withdraw();
      const btcFeesAmount = await renBTCContract.balanceOf(executorWalletAddress);
      const wethFeesAmount = await wethContract.balanceOf(executorWalletAddress);
      const btcAmountBought = await renBTCContract.balanceOf(myWalletAddress);
      const wethAmountBought = await wethContract.balanceOf(myWalletAddress);
      // Amount is fixed based on pinned block number
      expect(btcAmountBought.gt(BigNumber.from("3000000"))).to.be.true;
      expect(btcFeesAmount.gt(BigNumber.from("900000"))).to.be.true;
      expect(wethAmountBought.gt(BigNumber.from("26797614391107573657"))).to.be.true;
      expect(wethFeesAmount.gt(BigNumber.from("365928688500000000"))).to.be.true;
    });

    it("One pool not ready because of slippage", async function () {
      await vault1.editAccount(utils.parseUnits("10000000.0", USDC_DECIMALS), 1);

      const readyPools = await facade.readyPools();
      expect(readyPools.filter(isNonZeroAddress).length).to.be.equals(1);
    });

    it("Succeeds on the second evaluation", async function () {
      let readyPools = await facade.readyPools();

      await facade.evaluatePoolsAsExecutor(readyPools, { gasLimit: 9500000 });
      await advanceBlockAtTime((await getCurrentTimeStamp()) + 3700);
      readyPools = await facade.readyPools();

      await facade.evaluatePoolsAsExecutor(readyPools.filter(isNonZeroAddress), { gasLimit: 9500000 });
      await vault1.withdraw();

      const btcFeesAmount = await renBTCContract.balanceOf(executorWalletAddress);
      const btcAmountBought = await renBTCContract.balanceOf(myWalletAddress);

      // Amount is fixed based on pinned block number
      expect(btcAmountBought.gt(BigNumber.from("6000000"))).to.be.true;
      expect(btcFeesAmount.gt(BigNumber.from("1000000"))).to.be.true;
    });
  });
});

function isNonZeroAddress(e: string): boolean {
  return e !== constants.AddressZero;
}
