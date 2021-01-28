import { task, types } from "hardhat/config";
import { DCA_VAULT, I_WITHDRAWAL_STRATEGY } from "../../deployment/contract-names";
import { DcaVault } from "../../typechain";
import { IWithdrawalStrategy } from "../../typechain/IWithdrawalStrategy";
import { deployedContract } from "../../utils/deployment";
import { TASK_ADD_ROLE } from "../task-names";

task(TASK_ADD_ROLE, "Set withdrawal strategy for pool")
  .addParam("vault", "Vault address", null, types.string)
  .addParam("strategy", "Withdrawal strategy address", null, types.string)
  .setAction(
    async ({ vault, strategy }, hre): Promise<void> => {
      const vaultContract: DcaVault = await deployedContract(hre, DCA_VAULT, vault);
      const strategyContract: IWithdrawalStrategy = await deployedContract(hre, I_WITHDRAWAL_STRATEGY, strategy);
      const gas = await strategyContract.gasPerDistribution();
      if (gas <= 0) {
        throw new Error("Strategy contract is not valid");
      }
      await vaultContract.setWithdrawalStrategy(strategy);
    },
  );
