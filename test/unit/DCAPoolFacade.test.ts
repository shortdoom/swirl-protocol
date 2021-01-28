import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { constants, Contract, utils } from "ethers";
import { waffle } from "hardhat";
import DCAPoolFacade from "../../artifacts/contracts/DCAPoolFacade.sol/DCAPoolFacade.json";
import IDCAScheduler from "../../artifacts/contracts/interfaces/IDCAScheduler.sol/IDCAScheduler.json";
import IDCAVault from "../../artifacts/contracts/interfaces/IDCAVault.sol/IDCAVault.json";
import MockERC20 from "../../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import { DcaPoolFacade } from "../../typechain";
import { Period } from "../../types/types";

describe("DCA Facade", function () {
  let mockScheduler: MockContract;
  let mockVault: MockContract;
  let mockBaseToken: Contract;
  let mockOrderToken: Contract;

  let contract: DcaPoolFacade;
  let contractAsUser: DcaPoolFacade;
  let contractAsExecutor: DcaPoolFacade;

  const provider = waffle.provider;
  const [deployerWallet, userWallet, executorWallet] = provider.getWallets();
  const { deployMockContract, deployContract } = waffle;

  beforeEach(async () => {
    mockScheduler = await deployMockContract(deployerWallet, IDCAScheduler.abi);
    mockVault = await deployMockContract(deployerWallet, IDCAVault.abi);
    contract = (await deployContract(deployerWallet, DCAPoolFacade, [mockScheduler.address])) as DcaPoolFacade;
    mockBaseToken = await deployContract(deployerWallet, MockERC20, ["MockBase", "bERC20"]);
    mockOrderToken = await deployContract(deployerWallet, MockERC20, ["MockOrder", "oERC20"]);
    contractAsUser = contract.connect(userWallet);
    contractAsExecutor = contract.connect(executorWallet);
    await contract.addExecutor(executorWallet.address);
    await contract.addRegistrar(deployerWallet.address);
  });

  describe("Registration", function () {
    it("Registers pool correctly", async function () {
      const period = Period.HOURLY;
      const poolAddress = utils.getCreate2Address(
        contract.address,
        utils.solidityKeccak256(
          ["address", "address", "uint8"],
          [mockBaseToken.address, mockOrderToken.address, period],
        ),
        utils.keccak256(DCAPoolFacade.bytecode),
      );

      await contract.registerPool(mockBaseToken.address, mockOrderToken.address, period, poolAddress);

      let poolRegistered = await contract.getPool(mockBaseToken.address, mockOrderToken.address, period);
      expect(poolRegistered).to.be.equal(poolAddress);
      poolRegistered = await contract.pools(0);
      expect(poolRegistered).to.be.equal(poolAddress);
    });
  });

  describe("Views", function () {
    it("Returns ready pools", async function () {
      const mockVault1 = await deployMockContract(deployerWallet, IDCAVault.abi);
      const mockVault2 = await deployMockContract(deployerWallet, IDCAVault.abi);
      const mockVault3 = await deployMockContract(deployerWallet, IDCAVault.abi);
      // This pool will be included in the result
      await mockScheduler.mock.ready.withArgs(mockVault1.address).returns(true);
      // This pool will be excluded in the result
      await mockScheduler.mock.ready.withArgs(mockVault2.address).returns(false);
      // This pool will be included in the result
      await mockScheduler.mock.ready.withArgs(mockVault3.address).returns(true);

      // Register all mock pools
      await contract.registerPool(mockBaseToken.address, mockOrderToken.address, 1, mockVault1.address);
      await contract.registerPool(mockBaseToken.address, mockOrderToken.address, 2, mockVault2.address);
      await contract.registerPool(mockBaseToken.address, mockOrderToken.address, 3, mockVault3.address);

      const pools = await contract.readyPools();
      expect(pools).to.have.lengthOf(3);
      expect(pools).to.have.ordered.members([
        mockVault1.address,
        mockVault3.address,
        constants.AddressZero, // Array is zero-address terminated
      ]);
    });
  });

  describe("Withdrawals", async function () {
    it("Withdraws tokens and ETH", async function () {
      const intialUserEthBalance = await userWallet.getBalance();
      const baseTokenQty = 1000;
      const orderTokenQty = 100;
      await mockBaseToken.transfer(contract.address, baseTokenQty);
      await mockOrderToken.transfer(contract.address, orderTokenQty);
      await deployerWallet.sendTransaction({
        to: contract.address,
        value: utils.parseEther("1.0"),
      });
      await contract.withdraw([mockOrderToken.address, mockBaseToken.address], userWallet.address);
      expect((await mockBaseToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(baseTokenQty);
      expect((await mockOrderToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(orderTokenQty);
      expect((await userWallet.getBalance()).sub(intialUserEthBalance).toString()).to.be.equals(
        utils.parseEther("1.0").toString(),
      );
    });
  });

  describe("ACL", async function () {
    it("Adds executor correctly", async function () {
      await expect(contract.addExecutor(userWallet.address)).to.emit(contract, "RoleGranted");
    });

    it("Removes executor correctly", async function () {
      await contract.addExecutor(executorWallet.address);
      await expect(contract.removeExecutor(executorWallet.address)).to.emit(contract, "RoleRevoked");
    });

    it("Allows executor to call evaluatePoolsAsExecutor", async function () {
      await mockScheduler.mock.evaluate.returns();
      await contract.addExecutor(executorWallet.address);
      await expect(contractAsExecutor.evaluatePoolsAsExecutor([])).to.be.not.reverted;
    });

    it("Forbids non executor to call evaluatePoolsAsExecutor", async function () {
      await expect(contractAsUser.evaluatePoolsAsExecutor([])).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Allows admin to set registrar", async function () {
      await expect(contract.addRegistrar(userWallet.address)).not.to.be.reverted;
    });

    it("Forbids non admin to set registrar", async function () {
      await expect(contractAsUser.addRegistrar(userWallet.address)).to.be.revertedWith(
        "AccessControl: sender must be an admin to grant",
      );
    });

    it("Forbids non registrar to register pool", async function () {
      await expect(
        contractAsUser.registerPool(mockBaseToken.address, mockOrderToken.address, 1, mockVault.address),
      ).to.be.revertedWith("DCA: ACCESS_DENIED");
    });
  });
});
