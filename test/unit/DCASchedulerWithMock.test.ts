import { expect, use } from "chai";
import { deployContract, deployMockContract, MockContract, MockProvider, solidity } from "ethereum-waffle";
import { Contract } from "ethers";
import DCASchedulerABI from "../../artifacts/contracts/DCAScheduler.sol/DCAScheduler.json";
import DCAVaultABI from "../../artifacts/contracts/DCAVault.sol/DCAVault.json";
import GasCalculatorABI from "../../artifacts/contracts/interfaces/IGasCalculator.sol/IGasCalculator.json";
import MockBuyStrategy from "../../artifacts/contracts/mocks/MockBuyStrategy.sol/MockBuyStrategy.json";
import MockERC20 from "../../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import { DcaScheduler, Erc20 } from "../../typechain";

use(solidity);

const DEFAULT_CHAIN_ID = 1;

// Hardhat currently does not support mock interaction verification. We use the waffle provider directly in these tests
describe("DCA Scheduler Mock Interaction", function () {
  let mockBaseToken: Erc20;
  let mockOrderToken: Contract;
  let mockBuyStrategy: MockContract;
  let mockGasCalculator: MockContract;
  let mockDCAVault: MockContract;

  let contract: DcaScheduler;

  const provider = new MockProvider();
  const [deployerWallet] = provider.getWallets();

  beforeEach(async () => {
    mockGasCalculator = await deployMockContract(deployerWallet, GasCalculatorABI.abi);
    mockDCAVault = await deployMockContract(deployerWallet, DCAVaultABI.abi);
    mockBuyStrategy = await deployMockContract(deployerWallet, MockBuyStrategy.abi);
    mockBaseToken = (await deployContract(deployerWallet, MockERC20, ["MockBase", "bERC20"])) as Erc20;
    mockOrderToken = await deployContract(deployerWallet, MockERC20, ["MockOrder", "oERC20"]);
    contract = (await deployContract(deployerWallet, DCASchedulerABI, [mockGasCalculator.address])) as DcaScheduler;
    await contract.addExecutor(deployerWallet.address);
    // Allow deployer to artificially add pools
    await contract.addVault(deployerWallet.address);
    await contract.setFeesRecipient(deployerWallet.address);
  });

  async function createPool(vaultAddress: string) {
    await contract.addPool({
      vault: vaultAddress,
      buyStrategy: mockBuyStrategy.address,
      baseToken: mockBaseToken.address,
      orderToken: mockOrderToken.address,
      periodInSeconds: 100,
      baseTokenScalingFactor: 1,
    });
  }

  describe("Buy Strategy Interactions", async function () {
    it("Queries buy strategy on call to ready", async function () {
      await createPool(mockDCAVault.address);
      await contract.editSchedule(mockDCAVault.address, 0, 0, 100, 4);
      await mockBuyStrategy.mock.canBuy.returns(false);

      expect(await contract.ready(mockDCAVault.address)).to.be.false;

      expect("canBuy").to.be.calledOnContractWith(mockBuyStrategy, [
        100,
        mockBaseToken.address,
        mockOrderToken.address,
      ]);
    });

    it("Calls gas calculator, buy strategy and vault on evaluation", async function () {
      const vaultAddress = mockDCAVault.address;
      await mockBuyStrategy.mock.buy.returns(true);
      await mockDCAVault.mock.onExecution.returns();
      await mockGasCalculator.mock.calculateTokenForGas.returns(0);

      await createPool(vaultAddress);
      await contract.editSchedule(vaultAddress, 0, 0, 100, 4);

      await contract.evaluate(vaultAddress);

      expect("buy").to.be.calledOnContractWith(mockBuyStrategy, [
        mockDCAVault.address,
        100,
        mockBaseToken.address,
        mockOrderToken.address,
      ]);

      expect("calculateTokenForGas").to.be.calledOnContract(mockGasCalculator);
      // Order amount is 0 because we are using a mock strategy. Fees cannot be > than order amount
      expect("onExecution").to.be.calledOnContractWith(mockDCAVault, [100, 0]);
    });
  });
});
