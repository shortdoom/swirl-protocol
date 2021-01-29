import { BigNumber, ethers } from "ethers";
import { task, types } from "hardhat/config";
import { DCA_POOL_FACTORY } from "../../deployment/contract-names";
import { DcaPoolFactory } from "../../typechain";
import { Period } from "../../types/types";
import { deployedContract } from "../../utils/deployment";
import { TASK_ADD_POOL } from "../task-names";

task(TASK_ADD_POOL, "Add pool")
  .addParam("base", "Base token address", null, types.string)
  .addParam("order", "Order token address", null, types.string)
  .addParam(
    "period",
    `Period:  + ${Object.values(Period).filter(v => typeof v === "string")}. Use * for all periods`,
    "*",
    types.string,
  )
  .addParam("scaling", "Base Token Scaling Factor exponent", "", types.int)
  .setAction(
    async ({ base, order, period, scaling }, hre): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async function addPool(_period: any) {
        if (!(_period in Period)) {
          throw new Error("Invalid enum val:" + _period);
        }
        if (!Number.isInteger(scaling) || scaling > 36 || scaling < 0) {
          throw new Error(`Invalid scaling factor exponent: ${_period} Values must be an integer in [0,36]`);
        }
        const periodNumber = Period[_period];
        const factory: DcaPoolFactory = await deployedContract(hre, DCA_POOL_FACTORY);
        const normalizedBaseAddress = ethers.utils.getAddress(base);
        const normalizedOrderAddress = ethers.utils.getAddress(order);

        console.log("Adding pool with period", periodNumber);
        await factory.createPool(
          normalizedBaseAddress,
          normalizedOrderAddress,
          periodNumber,
          BigNumber.from(10).pow(scaling),
        );
      }
      // Task Start
      let periods: string[] = [period.toUpperCase()];
      if (period === "*") {
        console.log("Wildcard detected adding pools for all periods");
        periods = ["HOURLY", "DAILY", "WEEKLY", "MONTHLY"];
      }
      for (const periodToAdd of periods) {
        try {
          await addPool(periodToAdd);
        } catch (error) {
          console.log(error);
        }
      }
    },
  );
