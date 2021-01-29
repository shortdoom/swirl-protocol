import { config as dotenvConfig } from "dotenv";
import { BigNumber, Contract, ContractFactory, Signer, utils } from "ethers";
import hre, { ethers } from "hardhat";
import { resolve } from "path";
import ERC20ABI from "../../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json";
import BADGER_SETT from "../../artifacts/contracts/interfaces/IBadgerSett.sol/IBadgerSett.json";
import { Erc20, IBadgerSett } from "../../typechain";
dotenvConfig({ path: resolve(__dirname, "./.env") });

const SAFE_CHECKPOINT = 11497502;
export const WBTC_USDC_WHALE = "0x2bf792Ffe8803585F74E06907900c2dc2c29aDcb";
export const TBTC_WHALE = "0xF9e11762d522ea29Dd78178c9BAf83b7B093aacc";
export const ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const tBTC = "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa";
export const sBTC = "0xfE18be6b3Bd88A2D2A7f928d00292E7a9963CfC6";
export const renBTC = "0xEB4C2781e4ebA804CE9a9803C67d0893436bB27D";
export const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const wBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
export const tBTCSett = "0xb9D076fDe463dbc9f915E5392F807315Bf940334";
export const sBTCSett = "0xd04c48A53c111300aD41190D63681ed3dAd998eC";
export const renBTCSett = "0x6dEf55d2e18486B9dDfaA075bc4e4EE0B28c1545";
export const tBTCPool = "0xC25099792E9349C7DD09759744ea681C7de2cb66";
export const sBTCPool = "0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714";
export const renBTCPool = "0x93054188d876f558f4a66B2EF1d97d16eDf0895B";
export const tBTCCrv = "0x64eda51d3Ad40D56b9dFc5554E06F94e1Dd786Fd";
export const sBTCCrv = "0x075b1bb99792c9E1041bA13afEf80C91a1e70fB3";
export const renBTCCrv = "0x49849C98ae39Fff122806C06791Fa73784FB3675";
export const BADGER_GOVERNANCE = "0xb65cef03b9b89f99517643226d76e286ee999e77";
export const BTC_USD_PRICE_FEED = "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c";
export const USDC_ETH_PRICE_FEED = "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4";
export const BTC_ETH_PRICE_FEED = "0xdeb288F737066589598e9214E782fa5A8eD689e8";
export const ETH_DECIMALS = 18;
export const USDC_DECIMALS = 6;
export const REN_BTC_DECIMALS = 8;
export const WBTC_DECIMALS = 8;

export async function sudo_TransferToken(
  token: string,
  owner: string,
  amount: BigNumber,
  recipient: string,
): Promise<void> {
  return sudo(owner, (signer: Signer) => {
    const tokenContract = new Contract(token, ERC20ABI.abi, signer) as Erc20;
    return tokenContract.transfer(recipient, amount);
  });
}

export async function sudo_AllowContractAccessInSett(sett: string, contract: string): Promise<void> {
  return sudo(BADGER_GOVERNANCE, (signer: Signer) => {
    const settContract = new Contract(sett, BADGER_SETT.abi, signer) as IBadgerSett;
    return settContract.approveContractAccess(contract);
  });
}

async function sudo(sudoUser: string, block: (signer: Signer) => Promise<unknown>) {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [sudoUser],
  });
  const signer = await ethers.provider.getSigner(sudoUser);
  await block(signer);
}

export async function sentEth(to: string, amount: string, wallet: Signer): Promise<void> {
  const tx = {
    to,
    value: utils.parseEther(amount),
  };

  await wallet.sendTransaction(tx);
}

export async function resetFork(): Promise<void> {
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [
      {
        forking: {
          jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_TOKEN}`,
          blockNumber: SAFE_CHECKPOINT,
        },
      },
    ],
  });
}

export async function deployContract<T extends Contract>(contractName: string, args: Array<unknown> = []): Promise<T> {
  const contractFactory: ContractFactory = await hre.ethers.getContractFactory(contractName);
  const contract: Contract = await contractFactory.deploy(...args);
  await contract.deployed();
  return contract as T;
}
