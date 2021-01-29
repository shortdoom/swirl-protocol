import { ethers } from "ethers";
import { task, types } from "hardhat/config";
import { DCA_SCHEDULER } from "../../deployment/contract-names";
import { DcaScheduler } from "../../typechain";
import { deployedContract } from "../../utils/deployment";
import { TASK_SET_FEES } from "../task-names";

task(TASK_SET_FEES, "Set fees and recipient")
  .addParam("fees", "Fees expressed in BPS. Values: 0 to 300", null, types.int)
  .addOptionalParam("recipient", "Fees recipient address", "", types.string)
  .setAction(
    async ({ pool, fees, recipient }, hre): Promise<void> => {
      if (fees > 300 || fees < 0) {
        throw new Error("Invalid fee value");
      }
      const scheduler: DcaScheduler = await deployedContract(hre, DCA_SCHEDULER, pool);

      console.log("Setting fees to: ", fees);
      await scheduler.setFeesInBPS(fees);
      if (recipient) {
        const normalizedAddress = ethers.utils.getAddress(recipient);
        console.log("Setting fees recipient to: ", normalizedAddress);
        await scheduler.setFeesRecipient(normalizedAddress);
      }
    },
  );
