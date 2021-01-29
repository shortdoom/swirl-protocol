import { BigNumber, Contract, Signer, utils } from "ethers";
import hre, { ethers } from "hardhat";
const SECONDS_IN_DAY = 3600 * 24;
export const A_NON_ZERO_ADDRESS = "0x1234000000000000000000000000000000000000";

export const SECONDS_IN_PERIOD = [
  0,
  3600,
  SECONDS_IN_DAY,
  SECONDS_IN_DAY * 7,
  SECONDS_IN_DAY * 14,
  SECONDS_IN_DAY * 30,
  SECONDS_IN_DAY * 90,
];

export async function getCurrentTimeStamp(): Promise<number> {
  const blockNumber = await ethers.provider.getBlockNumber();
  return (await ethers.provider.getBlock(blockNumber)).timestamp;
}

export async function advanceBlockAtTime(time: number): Promise<void> {
  await ethers.provider.send("evm_mine", [time]);
}

export async function advanceBlockBySeconds(secondsToAdd: number): Promise<void> {
  const newTimestamp = (await getCurrentTimeStamp()) + secondsToAdd;
  await ethers.provider.send("evm_mine", [newTimestamp]);
}
export async function deployedContract<T extends Contract>(contractName: string, address: string): Promise<T> {
  return (await hre.ethers.getContractAt(contractName, address)) as T;
}

export async function callContractWithMetaTransaction(
  nonce: number,
  chainId: number,
  functionSignature: Uint8Array,
  contract: Contract,
  signer: Signer,
): Promise<void> {
  const messageToSign = utils.solidityKeccak256(
    ["uint256", "address", "uint256", "bytes"],
    [nonce, contract.address, chainId, functionSignature],
  );

  const signature = await signer.signMessage(utils.arrayify(messageToSign));
  const signerAddress = await signer.getAddress();

  const { r, s, v } = utils.splitSignature(signature);

  await contract.executeMetaTransaction(signerAddress, functionSignature, r, s, v);
}

export function isNotZero(e: number): boolean {
  return e != 0;
}
export function toNumber(e: BigNumber): number {
  return e.toNumber();
}
