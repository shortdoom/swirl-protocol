import { expect, use } from "chai";
import { deployContract, deployMockContract, MockContract, MockProvider, solidity } from "ethereum-waffle";
import { constants, Contract, utils } from "ethers";
import DCAPoolFactory from "../../artifacts/contracts/DCAPoolFactory.sol/DCAPoolFactory.json";
import DCAScheduler from "../../artifacts/contracts/DCAScheduler.sol/DCAScheduler.json";
import DCAVault from "../../artifacts/contracts/DCAVault.sol/DCAVault.json";
import IDCAPoolRegister from "../../artifacts/contracts/interfaces/IDCAPoolRegister.sol/IDCAPoolRegister.json";
import MockGasCalculator from "../../artifacts/contracts/interfaces/IGasCalculator.sol/IGasCalculator.json";
import MockBuyStrategy from "../../artifacts/contracts/mocks/MockBuyStrategy.sol/MockBuyStrategy.json";
import MockERC20 from "../../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import { DcaPoolFactory } from "../../typechain";
import { Period } from "../../types/types";

use(solidity);

// Hardhat currently does not support mock interaction verification. We use the waffle provider directly in these tests
describe("DCA Factory Mock Interaction", function () {
  let mockBaseToken: Contract;
  let mockOrderToken: Contract;
  let mockBuyStrategy: Contract;
  let mockRegistry: MockContract;
  let mockScheduler: MockContract;
  let mockGasCalculator;

  let contract: DcaPoolFactory;

  const provider = new MockProvider();
  const [deployerWallet] = provider.getWallets();

  beforeEach(async () => {
    mockGasCalculator = await deployMockContract(deployerWallet, MockGasCalculator.abi);
    mockBaseToken = await deployContract(deployerWallet, MockERC20, ["MockBase", "bERC20"]);
    mockOrderToken = await deployContract(deployerWallet, MockERC20, ["MockOrder", "oERC20"]);
    mockBuyStrategy = (await deployContract(deployerWallet, MockBuyStrategy)) as Contract;
    mockScheduler = await deployMockContract(deployerWallet, DCAScheduler.abi);

    mockRegistry = await deployMockContract(deployerWallet, IDCAPoolRegister.abi);
    contract = (await deployContract(deployerWallet, DCAPoolFactory, [
      mockBuyStrategy.address,
      mockGasCalculator.address,
      mockRegistry.address,
      mockScheduler.address,
    ])) as DcaPoolFactory;
    await mockScheduler.mock.addVault.returns();
    await mockScheduler.mock.addPool.returns();
  });

  describe("Pool Creation", async function () {
    it("Creates pool correctly", async function () {
      await mockRegistry.mock.registerPool.returns();
      await mockRegistry.mock.getPool.returns(constants.AddressZero);
      await contract.enableBaseToken(mockBaseToken.address);
      await contract.enableOrderToken(mockOrderToken.address);
      const period = Period.HOURLY;
      const poolAddress = utils.getCreate2Address(
        contract.address,
        utils.solidityKeccak256(
          ["address", "address", "uint8", "address"],
          [mockBaseToken.address, mockOrderToken.address, period, mockBuyStrategy.address],
        ),
        utils.keccak256(DCAVault.bytecode),
      );

      const scalingFactor = 1;
      await expect(contract.createPool(mockBaseToken.address, mockOrderToken.address, period, scalingFactor))
        .to.emit(contract, "PoolCreated")
        .withArgs(mockBaseToken.address, mockOrderToken.address, period, scalingFactor, poolAddress);
      expect("addPool").to.be.calledOnContract(mockScheduler);
    });
  });
});
