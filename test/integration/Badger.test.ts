import { Contract, Signer, utils } from "ethers";
import { ethers } from "hardhat";
import ERC20ABI from "../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import { BADGER_SETT_BUY_STRATEGY } from "../../deployment/contract-names";
import { BadgerSettBuyStrategy, Erc20 } from "../../typechain";
import {
  BADGER_GOVERNANCE,
  deployContract,
  renBTCSett,
  resetFork,
  sBTCSett,
  sentEth,
  sudo_AllowContractAccessInSett,
  sudo_TransferToken,
  tBTCSett,
  USDC,
  USDC_DECIMALS,
  WBTC_USDC_WHALE,
} from "../utils/integration";

describe("Badger Integration", function () {
  let myWallet: Signer;
  let myWalletAddress: string;
  let usdcContract: Erc20;
  let buyStrategy: BadgerSettBuyStrategy;
  beforeEach(async () => {
    await resetFork();
    [myWallet] = await ethers.getSigners();
    myWalletAddress = await myWallet.getAddress();
    await sudo_TransferToken(USDC, WBTC_USDC_WHALE, utils.parseUnits("100000.0", USDC_DECIMALS), myWalletAddress);
    usdcContract = new Contract(USDC, ERC20ABI.abi, myWallet) as Erc20;
    buyStrategy = await deployContract(BADGER_SETT_BUY_STRATEGY);
    await buyStrategy.enableSellToken(USDC);
    await usdcContract.approve(buyStrategy.address, utils.parseUnits("100000.0", USDC_DECIMALS));
    await sentEth(BADGER_GOVERNANCE, "10.0", myWallet);
    await sudo_AllowContractAccessInSett(tBTCSett, buyStrategy.address);
    await sudo_AllowContractAccessInSett(sBTCSett, buyStrategy.address);
    await sudo_AllowContractAccessInSett(renBTCSett, buyStrategy.address);
  });

  describe.skip("Badger Strategy", function () {
    // Currently not working due to block lock on Badger Sett
    it("Buys ren btc and deposits into sett", async function () {
      await buyStrategy.buy(myWalletAddress, utils.parseUnits("10000.0", USDC_DECIMALS), USDC, renBTCSett);
    });
  });
});
