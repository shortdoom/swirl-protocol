import { expect, use } from "chai";
import { deployContract, deployMockContract, MockContract, MockProvider, solidity } from "ethereum-waffle";
import { Contract } from "ethers";
import DCASchedulerABI from "../../artifacts/contracts/DCAScheduler.sol/DCAScheduler.json";
import DCAVaultABI from "../../artifacts/contracts/DCAVault.sol/DCAVault.json";
import IWithdrawalStrategyABI from "../../artifacts/contracts/interfaces/IWithdrawalStrategy.sol/IWithdrawalStrategy.json";
import MockBuyStrategy from "../../artifacts/contracts/mocks/MockBuyStrategy.sol/MockBuyStrategy.json";
import MockERC20 from "../../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import { DcaVault, Erc20 } from "../../typechain";

use(solidity);

const DEFAULT_CHAIN_ID = 1;

// Hardhat currently does not support mock interaction verification. We use the waffle provider directly in these tests
describe("DCA Vault Mock Interaction", function () {
  let mockBaseToken: Erc20;
  let mockBaseTokenAsUser: Erc20;
  let mockOrderToken: Contract;
  let mockBuyStrategy: MockContract;
  let mockScheduler: MockContract;
  let mockWithdrawalStrategy: MockContract;
  let contractAsUser: DcaVault;

  let contract: DcaVault;

  const provider = new MockProvider();
  const [deployerWallet, executorWallet, userWallet] = provider.getWallets();

  beforeEach(async () => {
    mockScheduler = await deployMockContract(deployerWallet, DCASchedulerABI.abi);
    mockWithdrawalStrategy = await deployMockContract(deployerWallet, IWithdrawalStrategyABI.abi);
    mockBuyStrategy = await deployMockContract(deployerWallet, MockBuyStrategy.abi);
    mockBaseToken = (await deployContract(deployerWallet, MockERC20, ["MockBase", "bERC20"])) as Erc20;
    mockBaseTokenAsUser = mockBaseToken.connect(userWallet);
    mockOrderToken = await deployContract(deployerWallet, MockERC20, ["MockOrder", "oERC20"]);
    contract = (await deployContract(deployerWallet, DCAVaultABI)) as DcaVault;
    contractAsUser = contract.connect(userWallet);
    await mockScheduler.mock.editSchedule.returns();
    await mockScheduler.mock.addPool.returns();
    await mockScheduler.mock.maxCycles.returns(256);
    await mockWithdrawalStrategy.mock.withdraw.returns();
    await contract.initialize(
      mockBuyStrategy.address,
      mockBaseToken.address,
      mockOrderToken.address,
      mockScheduler.address,
      100,
      1,
    );
    await contract.addScheduler(deployerWallet.address);

    await mockBaseToken.transfer(userWallet.address, 1000000000);

    await mockBaseToken.approve(contract.address, 1000000000);
    await mockBaseTokenAsUser.approve(contract.address, 1000000000);
  });

  describe("Buy Strategy Interactions", async function () {
    it("Calls scheduler with correct values on account creation with single cycle", async function () {
      const purchasePerPeriod = 1000;
      await contract.createAccount(purchasePerPeriod, 1);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 0, 0, purchasePerPeriod, 2]);
    });

    it("Calls scheduler with correct values on account creation with multiple cycles", async function () {
      const purchasePerPeriod = 1000;
      await contract.createAccount(purchasePerPeriod, 3);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 0, 0, purchasePerPeriod, 4]);
    });

    it("Calls scheduler with correct values on account creation after evaluation", async function () {
      const purchasePerPeriod = 1000;
      await contract.createAccount(1, 1);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 0, 0, 1, 2]);
      await contract.onExecution(1, 1);
      await contractAsUser.createAccount(purchasePerPeriod, 3);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 0, 0, purchasePerPeriod, 5]);
    });

    it("Calls scheduler with correct values on account edit", async function () {
      const purchasePerPeriod = 1000;
      await contract.createAccount(1, 1);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 0, 0, 1, 2]);
      await contract.editAccount(purchasePerPeriod, 3);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 1, 2, purchasePerPeriod, 4]);
    });

    it("Calls scheduler with correct values on account edit after evaluation", async function () {
      const purchasePerPeriod = 1000;
      await contract.createAccount(1, 1);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 0, 0, 1, 2]);
      await contract.onExecution(1, 1);
      await contract.editAccount(purchasePerPeriod, 3);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 1, 2, purchasePerPeriod, 5]);
    });

    it("Calls scheduler with correct values on account close", async function () {
      await contract.createAccount(1, 1);
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 0, 0, 1, 2]);
      await contract.closeAccount();
      expect("editSchedule").to.be.calledOnContractWith(mockScheduler, [contract.address, 1, 2, 0, 1]);
    });

    it("Calls withdrawal strategy with correct values on withdraw", async function () {
      await contract.setWithdrawalStrategy(mockWithdrawalStrategy.address);
      await contract.createAccount(1, 1);
      await contract.onExecution(1, 1);
      await contract.withdraw();
      expect("withdraw").to.be.calledOnContractWith(mockWithdrawalStrategy, [deployerWallet.address, 1]);
    });
  });
});
