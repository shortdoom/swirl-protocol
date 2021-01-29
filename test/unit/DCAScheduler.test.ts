import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { BigNumber } from "ethers";
import { waffle } from "hardhat";
import DCASchedulerABI from "../../artifacts/contracts/DCAScheduler.sol/DCAScheduler.json";
import DCAVaultABI from "../../artifacts/contracts/DCAVault.sol/DCAVault.json";
import GasCalculatorABI from "../../artifacts/contracts/interfaces/IGasCalculator.sol/IGasCalculator.json";
import MockBuyStrategyABI from "../../artifacts/contracts/mocks/MockBuyStrategy.sol/MockBuyStrategy.json";
import MockERC20ABI from "../../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import { DcaScheduler, MockBuyStrategy, MockErc20 } from "../../typechain";
import { advanceBlockBySeconds, A_NON_ZERO_ADDRESS, getCurrentTimeStamp, isNotZero, toNumber } from "../utils/utils";

const PERIOD_IN_S = 7200;
const COST_FOR_GAS = 1;
const RETRY_TIMEOUT = 300;

describe("DCAScheduler", function () {
  let mockBaseToken: MockErc20;

  let mockOrderToken: MockErc20;
  let mockBuyStrategy: MockBuyStrategy;
  let mockGasCalculator: MockContract;
  let mockDCAVault: MockContract;

  let contract: DcaScheduler;
  let contractAsUser: DcaScheduler;
  let contractAsExecutor: DcaScheduler;

  const provider = waffle.provider;
  const [deployerWallet, userWallet, , executorWallet] = provider.getWallets();

  beforeEach(async () => {
    const { deployMockContract, deployContract } = waffle;
    mockGasCalculator = (await deployMockContract(deployerWallet, GasCalculatorABI.abi)) as MockContract;
    mockDCAVault = (await deployMockContract(deployerWallet, DCAVaultABI.abi)) as MockContract;
    mockBaseToken = (await deployContract(deployerWallet, MockERC20ABI, ["MockBase", "bERC20"])) as MockErc20;
    mockOrderToken = (await deployContract(deployerWallet, MockERC20ABI, ["MockOrder", "oERC20"])) as MockErc20;
    mockBuyStrategy = (await deployContract(deployerWallet, MockBuyStrategyABI)) as MockBuyStrategy;
    contract = (await deployContract(deployerWallet, DCASchedulerABI, [mockGasCalculator.address])) as DcaScheduler;
    contractAsUser = contract.connect(userWallet);
    contractAsExecutor = contract.connect(executorWallet);
    await contract.setFeesInBPS(30);
    await contract.addExecutor(executorWallet.address);
    await contract.setFeesRecipient(executorWallet.address);
    // Needed to create pools
    await contract.addVault(deployerWallet.address);
    // Add some liquidity to the mock strategy to perform swap
    await mockOrderToken.transfer(mockBuyStrategy.address, 10000000000);
    // Add some liquidity to the mock vault to perform swap
    await mockBaseToken.transfer(mockDCAVault.address, 1000000000);
    //This is for fees
    await mockOrderToken.transfer(mockDCAVault.address, 1000000000);
    await mockOrderToken.godApprove(mockDCAVault.address, contract.address, 1000000000);

    // Return a default gas calculation
    await mockGasCalculator.mock.calculateTokenForGas.returns(COST_FOR_GAS);
    // Setup vault mock behaviour
    await mockDCAVault.mock.onExecution.returns();
  });

  async function assertScheduleIs(vaultAddress: string, expectedSchedule: number[]) {
    const actualSchedule = (await contract.getSchedule(vaultAddress)).map(toNumber).filter(isNotZero);
    // Contract target purchase amount updated
    expect(actualSchedule).to.be.eql(expectedSchedule);
  }

  async function createPool(vaultAddress: string) {
    await contract.addPool({
      vault: vaultAddress,
      buyStrategy: mockBuyStrategy.address,
      baseToken: mockBaseToken.address,
      orderToken: mockOrderToken.address,
      periodInSeconds: PERIOD_IN_S,
      baseTokenScalingFactor: 1,
    });
  }

  describe("Accounts", function () {
    it("Adds pool", async function () {
      await createPool(mockDCAVault.address);
      const pool = await contract.poolsByVault(mockDCAVault.address);
      expect(pool.buyStrategy).equals(mockBuyStrategy.address);
      expect(pool.baseToken).equals(mockBaseToken.address);
      expect(pool.orderToken).equals(mockOrderToken.address);
      expect(pool.periodInSeconds).equals(PERIOD_IN_S);
      expect(pool.nextTargetTimestamp.toNumber()).equals(await getCurrentTimeStamp());
      expect(pool.minTotalSellQty.toNumber()).equals(0);
      // expect(pool.schedule().length.equals(1));
      const schedule = await contract.getSchedule(mockDCAVault.address);
      expect(schedule.map(toNumber).filter(isNotZero)).eql([]);
      await contract.hasRole(await contract.VAULT_ROLE(), mockDCAVault.address);
    });

    it("Adds first values in schedule", async function () {
      await createPool(mockDCAVault.address);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 4);
      await assertScheduleIs(mockDCAVault.address, [100, 100, 100]);
    });

    it("Removes previously added values from schedule", async function () {
      await createPool(mockDCAVault.address);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 4);
      await contract.editSchedule(mockDCAVault.address, 100, 4, 0, 0);
      await assertScheduleIs(mockDCAVault.address, []);
    });

    it("Removes previously added values and adds new values in schedule", async function () {
      await createPool(mockDCAVault.address);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 4);
      await contract.editSchedule(mockDCAVault.address, 100, 2, 50, 5);
      await assertScheduleIs(mockDCAVault.address, [50, 150, 150, 50]);
    });

    it("Modifies schedule starting from currentCycle", async function () {
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      await mockBuyStrategy.setAmounts(0, 1);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 4);
      await contractAsExecutor.evaluate(vaultAddress);
      await contract.editSchedule(mockDCAVault.address, 100, 4, 50, 4);
      await advanceBlockBySeconds(PERIOD_IN_S + 10);
      // Schedule is returned from current index underlying would be: 0,0,50,50
      await assertScheduleIs(mockDCAVault.address, [50, 50]);
    });

    it("Fails when trying to remove non existent values", async function () {
      await createPool(mockDCAVault.address);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 4);
      await expect(contract.editSchedule(mockDCAVault.address, 100, 5, 0, 0)).to.be.reverted;
    });
  });

  describe("Timing and execution", async function () {
    it("Is ready after deployment", async function () {
      await createPool(mockDCAVault.address);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 2); // Needs schedule to be ready
      expect(await contract.ready(mockDCAVault.address)).to.be.true;
    });

    it("Is not ready after deployment without schedule", async function () {
      await createPool(mockDCAVault.address);
      expect(await contract.ready(mockDCAVault.address)).to.be.false;
    });

    it("Is ready after last evaluation + period", async function () {
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      await mockBuyStrategy.setAmounts(0, 100);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 4); // Needs schedule to be ready
      await contractAsExecutor.evaluate(vaultAddress);
      await advanceBlockBySeconds(PERIOD_IN_S - 10);
      expect(await contract.ready(vaultAddress)).to.be.false;
      await advanceBlockBySeconds(PERIOD_IN_S + 10);
      expect(await contract.ready(vaultAddress)).to.be.true;
    });

    it("Multiple executions", async function () {
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      const buyAmount = 1000;
      await mockBuyStrategy.setAmounts(0, buyAmount);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 5); // Needs schedule to be ready
      const fees = buyAmount * 0.003 + COST_FOR_GAS;
      await expect(contractAsExecutor.evaluate(vaultAddress))
        .to.emit(contract, "PoolEvaluated")
        .withArgs(100, buyAmount - fees, fees, (await getCurrentTimeStamp()) + PERIOD_IN_S + 1);

      await advanceBlockBySeconds(PERIOD_IN_S + 10);
      await expect(contractAsExecutor.evaluate(vaultAddress))
        .to.emit(contract, "PoolEvaluated")
        .withArgs(100, buyAmount - fees, fees, (await getCurrentTimeStamp()) + PERIOD_IN_S + 1);

      await advanceBlockBySeconds(PERIOD_IN_S + 10);
      await expect(contractAsExecutor.evaluate(vaultAddress))
        .to.emit(contract, "PoolEvaluated")
        .withArgs(100, buyAmount - fees, fees, (await getCurrentTimeStamp()) + PERIOD_IN_S + 1);

      await advanceBlockBySeconds(PERIOD_IN_S + 10);
      await expect(contractAsExecutor.evaluate(vaultAddress))
        .to.emit(contract, "PoolEvaluated")
        .withArgs(100, buyAmount - fees, fees, (await getCurrentTimeStamp()) + PERIOD_IN_S + 1);

      await advanceBlockBySeconds(PERIOD_IN_S + 10);
      expect(await contract.ready(vaultAddress)).to.be.false;
    });

    it("Retries after timeout if swap skips", async function () {
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      await mockBuyStrategy.setAmounts(0, 1);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 4); // Needs schedule to be ready
      await contractAsExecutor.evaluate(vaultAddress);
      // Force skipping swap
      await mockBuyStrategy.setSkip(true);
      await advanceBlockBySeconds(PERIOD_IN_S - 10);
      expect(await contract.ready(vaultAddress)).to.be.false;
      await advanceBlockBySeconds(PERIOD_IN_S + 10);
      expect(await contract.ready(vaultAddress)).to.be.true;
      await contractAsExecutor.evaluate(vaultAddress);
      // After skipped swap next evaluation is delayed by timeout
      expect(await contract.ready(vaultAddress)).to.be.false;
      await advanceBlockBySeconds(RETRY_TIMEOUT + 10);
      expect(await contract.ready(vaultAddress)).to.be.true;
    });

    it("Is not ready if total purchase less than minimum", async function () {
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 1000, 4);
      await contract.setMinTotalSellQty(vaultAddress, 1000);
      expect(await contract.ready(vaultAddress)).to.be.false;
      await contract.editSchedule(mockDCAVault.address, 0, 0, 1, 4);
      expect(await contract.ready(vaultAddress)).to.be.true;
    });
  });

  describe("Fees", async function () {
    it("Set fees recipient", async function () {
      await expect(contract.setFeesRecipient(userWallet.address))
        .to.emit(contract, "FeesRecipientUpdated")
        .withArgs(userWallet.address);
    });

    it("Fees are sent to fees recipient", async function () {
      const initialFeesRecipientBaseBalance: BigNumber = await mockOrderToken.balanceOf(executorWallet.address);
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      await contract.setFeesInBPS(300);
      const buyAmount = 1000;
      await mockBuyStrategy.setAmounts(0, buyAmount);
      await contract.editSchedule(vaultAddress, 0, 0, 100, 5); // Needs schedule to be ready
      const fees = buyAmount * 0.03 + COST_FOR_GAS;
      await contractAsExecutor.evaluate(vaultAddress);
      //Gas and fees sent to recipient
      expect(
        (await mockOrderToken.balanceOf(executorWallet.address)).toNumber() -
          initialFeesRecipientBaseBalance.toNumber(),
      ).to.be.equals(fees);
    });

    it("Charges fees correctly", async function () {
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      await contract.setFeesInBPS(300);
      const buyAmount = 1000;
      await mockBuyStrategy.setAmounts(0, buyAmount);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 5); // Needs schedule to be ready
      const fees = buyAmount * 0.03 + COST_FOR_GAS;
      await expect(contractAsExecutor.evaluate(vaultAddress))
        .to.emit(contract, "PoolEvaluated")
        .withArgs(100, buyAmount - fees, fees, (await getCurrentTimeStamp()) + PERIOD_IN_S + 1);
    });

    it("Limits fees to 3%", async function () {
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      await contract.setFeesInBPS(1000);
      const buyAmount = 1000;
      await mockBuyStrategy.setAmounts(0, buyAmount);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 5); // Needs schedule to be ready
      const fees = buyAmount * 0.03 + COST_FOR_GAS;
      await expect(contractAsExecutor.evaluate(vaultAddress))
        .to.emit(contract, "PoolEvaluated")
        .withArgs(100, buyAmount - fees, fees, (await getCurrentTimeStamp()) + PERIOD_IN_S + 1);
    });
  });
  describe("ACL", async function () {
    it("Allows admin to set fees recipient", async function () {
      await expect(contract.setFeesRecipient(userWallet.address)).not.to.be.reverted;
    });

    it("Forbids non admin to set fees recipient", async function () {
      await expect(contractAsUser.setFeesRecipient(userWallet.address)).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Set fees", async function () {
      await expect(contract.setFeesInBPS(100)).to.emit(contract, "FeesUpdated").withArgs(100);
    });

    it("Allows admin to set fees", async function () {
      await expect(contract.setFeesInBPS(100)).not.to.be.reverted;
    });

    it("Forbids non admin to set fees", async function () {
      await expect(contractAsUser.setFeesInBPS(100)).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Forbids non executors to evaluate", async function () {
      await expect(contract.evaluate(A_NON_ZERO_ADDRESS)).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Allows admin to set min total sell quantity", async function () {
      const vaultAddress = mockDCAVault.address;
      await createPool(vaultAddress);
      await expect(contract.setMinTotalSellQty(vaultAddress, 100)).not.to.be.reverted;
    });

    it("Forbids non admin to set min total purchase quantity", async function () {
      await expect(contractAsUser.setMinTotalSellQty(A_NON_ZERO_ADDRESS, 100)).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Forbids non admin to set vault", async function () {
      await expect(contractAsUser.addVault(A_NON_ZERO_ADDRESS)).to.be.revertedWith(
        "AccessControl: sender must be an admin to grant",
      );
    });
  });
});
