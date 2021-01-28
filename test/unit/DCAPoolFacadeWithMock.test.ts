import { expect, use } from "chai";
import { deployContract, deployMockContract, MockContract, MockProvider, solidity } from "ethereum-waffle";
import { Contract } from "ethers";
import DCAPoolFacade from "../../artifacts/contracts/DCAPoolFacade.sol/DCAPoolFacade.json";
import IDCAVault from "../../artifacts/contracts/interfaces/IDCAVault.sol/IDCAVault.json";
import IDCAScheduler from "../../artifacts/contracts/interfaces/IDCAScheduler.sol/IDCAScheduler.json";
import MockERC20 from "../../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";

use(solidity);

// Hardhat currently does not support mock interaction verification. We use the waffle provider directly in these tests
describe("DCA Facade Mock Interactions", function () {
  let mockScheduler: MockContract;
  let mockVault: MockContract;
  let mockBaseToken: Contract;
  let mockOrderToken: Contract;

  let contract: Contract;
  let contractAsExecutor: Contract;

  const provider = new MockProvider();
  const [deployerWallet, executorWallet] = provider.getWallets();

  beforeEach(async () => {
    mockScheduler = await deployMockContract(deployerWallet, IDCAScheduler.abi);
    mockVault = await deployMockContract(deployerWallet, IDCAVault.abi);
    contract = await deployContract(deployerWallet, DCAPoolFacade, [mockScheduler.address]);
    mockBaseToken = await deployContract(deployerWallet, MockERC20, ["MockBase", "bERC20"]);
    mockOrderToken = await deployContract(deployerWallet, MockERC20, ["MockOrder", "oERC20"]);
    contractAsExecutor = contract.connect(executorWallet);
    await contract.addExecutor(executorWallet.address);
    await contract.addRegistrar(deployerWallet.address);
  });

  describe("Execution", function () {
    it("Delegates evaluation to pools", async function () {
      await contract.registerPool(mockBaseToken.address, mockOrderToken.address, 1, mockVault.address);
      await mockScheduler.mock.evaluate.returns();
      await contractAsExecutor.evaluatePoolsAsExecutor([mockVault.address]);

      expect("evaluate").to.be.calledOnContract(mockScheduler);
    });
  });
});
