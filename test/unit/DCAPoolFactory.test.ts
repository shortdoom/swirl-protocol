import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { constants, Contract, utils } from "ethers";
import { waffle } from "hardhat";
import DCAPoolFactory from "../../artifacts/contracts/DCAPoolFactory.sol/DCAPoolFactory.json";
import DCAScheduler from "../../artifacts/contracts/DCAScheduler.sol/DCAScheduler.json";
import IDCAPoolRegister from "../../artifacts/contracts/interfaces/IDCAPoolRegister.sol/IDCAPoolRegister.json";
import MockGasCalculator from "../../artifacts/contracts/interfaces/IGasCalculator.sol/IGasCalculator.json";
import MockBuyStrategy from "../../artifacts/contracts/mocks/MockBuyStrategy.sol/MockBuyStrategy.json";
import MockERC20 from "../../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import { DCA_VAULT } from "../../deployment/contract-names";
import { DcaPoolFactory, DcaVault } from "../../typechain";
import { Period } from "../../types/types";
import { A_NON_ZERO_ADDRESS, deployedContract } from "../utils/utils";

const DEFAULT_CHAIN_ID = 1;

describe("DCA Factory", function () {
  let mockBaseToken: Contract;
  let mockOrderToken: Contract;
  let mockBuyStrategy;
  let mockRegistry: MockContract;
  let mockScheduler: MockContract;
  let mockGasCalculator;

  let contract: DcaPoolFactory;
  let contractAsUser: DcaPoolFactory;

  const provider = waffle.provider;
  const [deployerWallet, userWallet, executorWallet] = provider.getWallets();
  const { deployMockContract, deployContract } = waffle;

  beforeEach(async () => {
    mockGasCalculator = await deployMockContract(deployerWallet, MockGasCalculator.abi);
    mockBaseToken = await deployContract(deployerWallet, MockERC20, ["MockBase", "bERC20"]);
    mockOrderToken = await deployContract(deployerWallet, MockERC20, ["MockOrder", "oERC20"]);
    mockBuyStrategy = await deployContract(deployerWallet, MockBuyStrategy);
    mockRegistry = await deployMockContract(deployerWallet, IDCAPoolRegister.abi);
    mockScheduler = await deployMockContract(deployerWallet, DCAScheduler.abi);
    contract = (await deployContract(deployerWallet, DCAPoolFactory, [
      mockBuyStrategy.address,
      mockGasCalculator.address,
      mockRegistry.address,
      mockScheduler.address,
    ])) as DcaPoolFactory;
    contractAsUser = contract.connect(userWallet);
    await mockScheduler.mock.addVault.returns();
    await mockScheduler.mock.addPool.returns();
  });

  it("Enables Base Token", async function () {
    await expect(contract.enableBaseToken(mockBaseToken.address))
      .to.emit(contract, "BaseTokenEnabled")
      .withArgs(mockBaseToken.address);
  });

  it("Enables Order Token", async function () {
    await expect(contract.enableOrderToken(mockOrderToken.address))
      .to.emit(contract, "OrderTokenEnabled")
      .withArgs(mockOrderToken.address);
  });

  describe("Pool Creation", async function () {
    it("Cannot create pool with same tokens", async function () {
      await contract.enableBaseToken(mockBaseToken.address);
      await contract.enableOrderToken(mockBaseToken.address);
      await expect(
        contract.createPool(mockBaseToken.address, mockBaseToken.address, Period.MONTHLY, 1),
      ).to.be.revertedWith("DCA_FACTORY: SAME_TOKEN");
    });

    it("Cannot create pool with disabled base token", async function () {
      await contract.enableOrderToken(mockOrderToken.address);
      await expect(
        contract.createPool(mockBaseToken.address, mockOrderToken.address, Period.MONTHLY, 1),
      ).to.be.revertedWith("DCA_FACTORY: INVALID_B_TOKEN");
    });

    it("Cannot create pool with disabled order token", async function () {
      await contract.enableBaseToken(mockBaseToken.address);
      await expect(
        contract.createPool(mockBaseToken.address, mockOrderToken.address, Period.MONTHLY, 1),
      ).to.be.revertedWith("DCA_FACTORY: INVALID_O_TOKEN");
    });

    it("Pool with same tokens and period but different buy strategy can be created multiple times", async function () {
      await mockRegistry.mock.registerPool.returns();
      await contract.enableBaseToken(mockBaseToken.address);
      await contract.enableOrderToken(mockOrderToken.address);

      await expect(contract.createPool(mockBaseToken.address, mockOrderToken.address, Period.HOURLY, 1)).to.emit(
        contract,
        "PoolCreated",
      );
      await contract.setBuyStrategy(mockOrderToken.address, A_NON_ZERO_ADDRESS);
      await expect(contract.createPool(mockBaseToken.address, mockOrderToken.address, Period.HOURLY, 1)).to.emit(
        contract,
        "PoolCreated",
      );
    });

    it("Pool with same parameters can be created only once", async function () {
      await mockRegistry.mock.registerPool.returns();
      await contract.enableBaseToken(mockBaseToken.address);
      await contract.enableOrderToken(mockOrderToken.address);

      await contract.createPool(mockBaseToken.address, mockOrderToken.address, Period.HOURLY, 1);

      await expect(contract.createPool(mockBaseToken.address, mockOrderToken.address, Period.HOURLY, 1)).to.be.reverted;
    });
  });

  describe("ACL", async function () {
    it("Grants admin role to caller and adds vault to scheduler", async function () {
      await mockRegistry.mock.registerPool.returns();
      await contract.enableBaseToken(mockBaseToken.address);
      await contract.enableOrderToken(mockOrderToken.address);
      const tx = await contract.createPool(mockBaseToken.address, mockOrderToken.address, Period.HOURLY, 1);
      const receipt = await tx.wait();
      // Pool creation event is the last to be emitted
      const creationEvent = receipt.events?.pop();
      const poolContract: DcaVault = await deployedContract(DCA_VAULT, creationEvent?.args?.["vault"]);
      const adminRoleHash = constants.HashZero;
      expect(await poolContract.hasRole(adminRoleHash, deployerWallet.address)).to.be.true;
      expect(await poolContract.hasRole(utils.id("SCHEDULER_ROLE"), mockScheduler.address)).to.be.true;
    });

    it("Forbids non admin to enable base token", async function () {
      await contract.addExecutor(executorWallet.address);
      await expect(contractAsUser.enableBaseToken(mockBaseToken.address)).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Forbids non admin to enable order token", async function () {
      await contract.addExecutor(executorWallet.address);
      await expect(contractAsUser.enableBaseToken(mockOrderToken.address)).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Forbids non admin to set default buy strategy", async function () {
      await contract.addExecutor(executorWallet.address);
      await expect(contractAsUser.setDefaultBuyStrategy(A_NON_ZERO_ADDRESS)).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Forbids non admin to set buy strategy", async function () {
      await contract.addExecutor(executorWallet.address);
      await expect(contractAsUser.setBuyStrategy(A_NON_ZERO_ADDRESS, A_NON_ZERO_ADDRESS)).to.be.revertedWith(
        "DCA: ACCESS_DENIED",
      );
    });
  });
});
