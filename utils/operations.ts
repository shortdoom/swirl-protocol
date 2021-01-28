import { constants } from "ethers";

export function isNonZeroAddress(e: string): boolean {
  return e !== constants.AddressZero;
}
