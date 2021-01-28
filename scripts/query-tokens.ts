// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import hre, { ethers } from "hardhat";
import { DCA_POOL_FACADE, MOCK_BUY_STRATEGY, MOCK_ERC_20 } from "../deployment/contract-names";
import { DcaPoolFacade, Erc20, Ierc20, MockBuyStrategy } from "../typechain";
import { deployedContract } from "../utils/deployment";

async function main(): Promise<void> {
  const token: Erc20 = await deployedContract(hre, MOCK_ERC_20, "0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD");
  await token.approve("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", 10000);
  return;
  const decimals = await token.decimals();
  const symbol = await token.symbol();
  const allowance = await token.allowance(
    "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    "0xa25996b4f4d58b1983433207fd22708454e0633a",
  );

  console.log("Decimals and Symbol", decimals, symbol);
  console.log("Allowance", allowance.toNumber());
  console.log(ethers.getDefaultProvider().network.chainId);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
