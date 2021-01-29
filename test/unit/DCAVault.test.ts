import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { BigNumber, utils } from "ethers";
import { waffle } from "hardhat";
import DCASchedulerABI from "../../artifacts/contracts/DCAScheduler.sol/DCAScheduler.json";
import DCAVaultABI from "../../artifacts/contracts/DCAVault.sol/DCAVault.json";
import GasCalculatorABI from "../../artifacts/contracts/interfaces/IGasCalculator.sol/IGasCalculator.json";
import WithdrawalStrategyABI from "../../artifacts/contracts/interfaces/IWithdrawalStrategy.sol/IWithdrawalStrategy.json";
import MockBuyStrategyABI from "../../artifacts/contracts/mocks/MockBuyStrategy.sol/MockBuyStrategy.json";
import MockERC20ABI from "../../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json";
import { DcaScheduler, DcaVault, MockBuyStrategy, MockErc20 } from "../../typechain";
import { isNotZero, toNumber } from "../utils/utils";

const PERIOD_IN_S = 7200;
const COST_FOR_GAS = 1;
const RETRY_TIMEOUT = 300;
const DEFAULT_CHAIN_ID = 1;

describe("DCAVault", function () {
  const { deployMockContract, deployContract } = waffle;
  let mockBaseToken: MockErc20;
  let mockBaseTokenAsUser: MockErc20;
  let mockBaseTokenAsUser2: MockErc20;
  let mockBaseTokenAsUser3: MockErc20;

  let mockOrderToken: MockErc20;
  let mockBuyStrategy: MockBuyStrategy;
  let mockGasCalculator: MockContract;
  let scheduler: DcaScheduler;

  let contract: DcaVault;
  let contractAsUser: DcaVault;
  let contractAsUser2: DcaVault;
  let contractAsUser3: DcaVault;

  const provider = waffle.provider;
  const [deployerWallet, userWallet, userWallet2, executorWallet, userWallet3] = provider.getWallets();

  beforeEach(async () => {
    mockGasCalculator = (await deployMockContract(deployerWallet, GasCalculatorABI.abi)) as MockContract;
    mockBaseToken = (await deployContract(deployerWallet, MockERC20ABI, ["MockBase", "bERC20"])) as MockErc20;
    mockBaseTokenAsUser = mockBaseToken.connect(userWallet);
    mockBaseTokenAsUser2 = mockBaseToken.connect(userWallet2);
    mockBaseTokenAsUser3 = mockBaseToken.connect(userWallet3);
    mockOrderToken = (await deployContract(deployerWallet, MockERC20ABI, ["MockOrder", "oERC20"])) as MockErc20;
    mockBuyStrategy = (await deployContract(deployerWallet, MockBuyStrategyABI)) as MockBuyStrategy;
    scheduler = (await deployContract(deployerWallet, DCASchedulerABI, [mockGasCalculator.address])) as DcaScheduler;
    contract = (await deployContract(deployerWallet, DCAVaultABI)) as DcaVault;
    contractAsUser = contract.connect(userWallet);
    contractAsUser2 = contract.connect(userWallet2);
    contractAsUser3 = contract.connect(userWallet3);
    await scheduler.addVault(contract.address);
    await contract.initialize(
      mockBuyStrategy.address,
      mockBaseToken.address,
      mockOrderToken.address,
      scheduler.address,
      PERIOD_IN_S,
      1,
    );
    await contract.addScheduler(deployerWallet.address);
    // Add some base token liquidity to users wallets
    await mockBaseToken.transfer(userWallet.address, 1000000000);
    await mockBaseToken.transfer(userWallet2.address, 1000000000);
    // Pre-approve contract for transfers on users behalf
    await mockBaseToken.approve(contract.address, 1000000000);
    await mockBaseTokenAsUser.approve(contract.address, 1000000000);
    await mockBaseTokenAsUser2.approve(contract.address, 1000000000);
  });

  async function assertScheduleIs(expectedSchedule: number[]) {
    const actualSchedule = (await scheduler.getSchedule(contract.address)).map(toNumber).filter(isNotZero);
    // Contract target purchase amount updated
    expect(actualSchedule).to.be.eql(expectedSchedule);
  }
  describe("Init", function () {
    it("Registers scheduler", async function () {
      await contract.hasRole(await contract.SCHEDULER_ROLE(), scheduler.address);
    });
  });
  describe("Accounts", function () {
    it("Creates Account", async function () {
      const purchasePerPeriod = 1000;
      const initialUserBaseBalance = await mockBaseToken.balanceOf(userWallet.address);
      const numberOfCycles = 3;
      await expect(contractAsUser.createAccount(purchasePerPeriod, numberOfCycles))
        .to.emit(contract, "AccountModified")
        .withArgs(userWallet.address, purchasePerPeriod, numberOfCycles);
      // Contract target purchase amount updated
      await assertScheduleIs([purchasePerPeriod, purchasePerPeriod, purchasePerPeriod]);

      const totalAmount = numberOfCycles * purchasePerPeriod;
      // Contract prepaid
      expect((await mockBaseToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(
        initialUserBaseBalance.toNumber() - totalAmount,
      );
      expect((await mockBaseToken.balanceOf(contract.address)).toNumber()).to.be.equals(totalAmount);
    });

    it("Creates Account fails with 0 cycles", async function () {
      const purchasePerPeriod = 1000;
      await expect(contractAsUser.createAccount(purchasePerPeriod, 0)).to.be.revertedWith("DCA_VAULT:INVALID_ACCOUNT");
    });

    it("Creates Account fails with 0 quantity", async function () {
      await expect(contractAsUser.createAccount(0, 10)).to.be.revertedWith("DCA_VAULT:INVALID_ACCOUNT");
    });

    it("Creates Account fails with balance not enough", async function () {
      await mockBaseToken.transfer(userWallet3.address, 50);
      await mockBaseTokenAsUser3.approve(contract.address, 10000);
      await expect(contractAsUser3.createAccount(1000, 10)).to.be.revertedWith(
        "ERC20: transfer amount exceeds balance",
      );
    });

    it("Creates Account fails when allowance not enough", async function () {
      await mockBaseToken.transfer(userWallet3.address, 1000);
      await mockBaseTokenAsUser3.approve(contract.address, 500);
      await expect(contractAsUser3.createAccount(1000, 1)).to.be.revertedWith(
        "ERC20: transfer amount exceeds allowance",
      );
    });

    it("Creates Account fails when min qty error", async function () {
      const purchasePerPeriod = 1000;
      await contract.setMinQty(purchasePerPeriod + 1);
      await expect(contractAsUser.createAccount(purchasePerPeriod, 2)).to.be.revertedWith("DCA_VAULT:MIN_QTY");
    });

    it("Creates Account fails when qty > 2^128", async function () {
      await expect(contractAsUser.createAccount(utils.parseEther("1000000000000000000000"), 2)).to.be.revertedWith(
        "SafeCast: value doesn't fit in 128 bits",
      );
    });

    it("Creates Account fails when cycles > 255", async function () {
      await expect(contractAsUser.createAccount(2, 256)).to.be.revertedWith("DCA_VAULT:INVALID_ACCOUNT");
    });

    it("Schedule adjusted according to accounts created", async function () {
      const purchasePerPeriod = 1000;
      const purchasePerPeriod1 = 666;
      const purchasePerPeriod2 = 100;
      await contract.createAccount(purchasePerPeriod, 2);
      await contractAsUser.createAccount(purchasePerPeriod1, 3);
      await contractAsUser2.createAccount(purchasePerPeriod2, 4);

      await assertScheduleIs([
        purchasePerPeriod + purchasePerPeriod1 + purchasePerPeriod2,
        purchasePerPeriod + purchasePerPeriod1 + purchasePerPeriod2,
        purchasePerPeriod1 + purchasePerPeriod2,
        purchasePerPeriod2,
      ]);
    });

    it("Fails double account creation", async function () {
      const purchasePerPeriod = 1000;
      await contractAsUser.createAccount(purchasePerPeriod, 10);
      await expect(contractAsUser.createAccount(purchasePerPeriod, 5)).to.be.revertedWith("DCA_VAULT:ALREADY_EXISTS");
    });

    it("Reverts edit account with min qty error", async function () {
      const purchasePerPeriod = 1000;
      await contractAsUser.createAccount(purchasePerPeriod, 2);
      await contract.setMinQty(purchasePerPeriod + 1);
      await expect(contractAsUser.editAccount(purchasePerPeriod, 2)).to.be.revertedWith("DCA_VAULT:MIN_QTY");
    });

    it("Reverts edit account with qty > 2^128", async function () {
      await contractAsUser.createAccount(2, 2);
      await expect(contractAsUser.editAccount(BigNumber.from("2").pow(BigNumber.from("129")), 2)).to.be.revertedWith(
        "SafeCast: value doesn't fit in 64 bits",
      );
    });

    it("Reverts edit account with cycles > 255", async function () {
      await contractAsUser.createAccount(2, 2);
      await expect(contractAsUser.editAccount(2, 256)).to.be.revertedWith("DCA_VAULT:INVALID_ACCOUNT");
    });

    it("Edits Account with higher qty and cycles", async function () {
      const purchasePerPeriod = 1000;
      const amendedPurchasePerPeriod = purchasePerPeriod + 100;
      const initialUserBaseBalance = await mockBaseToken.balanceOf(userWallet.address);
      await contractAsUser.createAccount(purchasePerPeriod, 2);
      const amendedCycles = 3;
      await expect(contractAsUser.editAccount(amendedPurchasePerPeriod, amendedCycles))
        .to.emit(contract, "AccountModified")
        .withArgs(userWallet.address, amendedPurchasePerPeriod, amendedCycles);

      await assertScheduleIs([amendedPurchasePerPeriod, amendedPurchasePerPeriod, amendedPurchasePerPeriod]);

      // Contract prepaid for next execution
      expect((await mockBaseToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(
        initialUserBaseBalance.toNumber() - amendedCycles * amendedPurchasePerPeriod,
      );
      expect((await mockBaseToken.balanceOf(contract.address)).toNumber()).to.be.equals(
        amendedCycles * amendedPurchasePerPeriod,
      );
    });

    it("Edits Account with same values is idempotent", async function () {
      const purchasePerPeriod = 1000;
      const amendedPurchasePerPeriod = purchasePerPeriod;
      const initialUserBaseBalance = await mockBaseToken.balanceOf(userWallet.address);
      await contractAsUser.createAccount(purchasePerPeriod, 2);
      const amendedCycles = 2;
      await contractAsUser.editAccount(amendedPurchasePerPeriod, amendedCycles);

      await assertScheduleIs([amendedPurchasePerPeriod, amendedPurchasePerPeriod]);

      // Contract prepaid for next execution
      expect((await mockBaseToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(
        initialUserBaseBalance.toNumber() - amendedCycles * amendedPurchasePerPeriod,
      );
      expect((await mockBaseToken.balanceOf(contract.address)).toNumber()).to.be.equals(
        amendedCycles * amendedPurchasePerPeriod,
      );
    });

    it("Edits Account with lower qty and cycles", async function () {
      const purchasePerPeriod = 1000;
      const amendedPurchasePerPeriod = purchasePerPeriod - 100;
      const initialUserBaseBalance = await mockBaseToken.balanceOf(userWallet.address);
      await contractAsUser.createAccount(purchasePerPeriod, 6);
      const amendedCycles = 3;
      await contractAsUser.editAccount(amendedPurchasePerPeriod, amendedCycles);

      await assertScheduleIs([amendedPurchasePerPeriod, amendedPurchasePerPeriod, amendedPurchasePerPeriod]);
      // Contract prepaid for next execution
      expect((await mockBaseToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(
        initialUserBaseBalance.toNumber() - amendedCycles * amendedPurchasePerPeriod,
      );
      expect((await mockBaseToken.balanceOf(contract.address)).toNumber()).to.be.equals(
        amendedCycles * amendedPurchasePerPeriod,
      );
    });

    it("Edits non existent account and fails", async function () {
      await expect(contractAsUser.editAccount(1000, 7)).to.be.revertedWith("DCA_VAULT:NOT_FOUND");
    });

    it("Edits with 0 quantity and fails", async function () {
      await contractAsUser.createAccount(100, 100);
      await expect(contractAsUser.editAccount(0, 7)).to.be.revertedWith("DCA_VAULT:INVALID_ACCOUNT");
    });

    it("Edits with 0 cycles and fails", async function () {
      await contractAsUser.createAccount(100, 100);
      await expect(contractAsUser.editAccount(10, 0)).to.be.revertedWith("DCA_VAULT:INVALID_ACCOUNT");
    });

    it("Returns tokens on closing account without evaluation", async function () {
      const purchasePerPeriod = 1000;
      const initialUserBaseBalance = await mockBaseToken.balanceOf(userWallet.address);
      await contractAsUser.createAccount(purchasePerPeriod, 2);
      await expect(contractAsUser.closeAccount())
        .to.emit(contract, "AccountModified")
        .withArgs(userWallet.address, 0, 0);

      await assertScheduleIs([]);

      // Contract prepaid for next execution
      expect((await mockBaseToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(
        initialUserBaseBalance.toNumber(),
      );
      expect((await mockBaseToken.balanceOf(contract.address)).toNumber()).to.be.equals(0);
    });

    it("Returns tokens on closing account with evaluation", async function () {
      const tokenPurchasedQty = 100;
      await mockBuyStrategy.setAmounts(0, tokenPurchasedQty); //Sell amount is taken from the function call
      const purchasePerPeriod = 1000;
      const initialUserBaseBalance = await mockBaseToken.balanceOf(userWallet.address);
      await contractAsUser.createAccount(purchasePerPeriod, 2);
      // Values not relevant for this test
      await contract.onExecution(100, 0);
      await contractAsUser.closeAccount();

      // Contract prepaid for next execution
      expect((await mockBaseToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(
        initialUserBaseBalance.toNumber() - purchasePerPeriod,
      );
    });

    it("Closes non existent account and fails", async function () {
      await expect(contractAsUser.closeAccount()).to.be.revertedWith("DCA_VAULT:NOT_FOUND");
    });
  });

  describe("Withdrawals", async function () {
    it("Withdraws tokens after executions and closing account and resets account", async function () {
      const purchasedAmount = 100;
      await mockOrderToken.transfer(contract.address, 2 * purchasedAmount);
      const saleAmount = 1000;
      const initialUserOrderBalance = await mockOrderToken.balanceOf(userWallet.address);
      await contractAsUser.createAccount(saleAmount, 2);
      await contract.onExecution(saleAmount, purchasedAmount);
      await contract.onExecution(saleAmount, purchasedAmount);
      await contractAsUser.withdraw();
      expect((await mockOrderToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(
        initialUserOrderBalance.toNumber() + 2 * purchasedAmount,
      );
      const account = await contractAsUser.accountByOwner(userWallet.address);
      expect(account.orderTokenBalance.toNumber()).to.be.equals(0);
      expect(account.startCycle).to.be.equals(3);
      expect(account.endCycle).to.be.equals(3);
    });

    it("Withdraws tokens after non final executions and reset account", async function () {
      const purchasedAmount = 100;
      await mockOrderToken.transfer(contract.address, 2 * purchasedAmount);
      const saleAmount = 1000;
      const initialUserOrderBalance = await mockOrderToken.balanceOf(userWallet.address);
      await contractAsUser.createAccount(saleAmount, 4);
      await contract.onExecution(saleAmount, purchasedAmount);
      await contract.onExecution(saleAmount, purchasedAmount);
      await contractAsUser.withdraw();
      expect((await mockOrderToken.balanceOf(userWallet.address)).toNumber()).to.be.equals(
        initialUserOrderBalance.toNumber() + 2 * purchasedAmount,
      );
      const account = await contractAsUser.accountByOwner(userWallet.address);
      expect(account.orderTokenBalance.toNumber()).to.be.equals(0);
      expect(account.startCycle).to.be.equals(3);
      expect(account.endCycle).to.be.equals(5);
    });
  });

  describe("Balances", async function () {
    it("Base balance updated after execution", async function () {
      const purchasedAmount = 100;
      const sellAmount = 1000;
      await contractAsUser.createAccount(sellAmount, 2);
      expect((await contract.baseTokenBalanceOf(userWallet.address)).toNumber()).to.be.equals(2 * sellAmount);
      await contract.onExecution(sellAmount, purchasedAmount);
      expect((await contract.baseTokenBalanceOf(userWallet.address)).toNumber()).to.be.equals(sellAmount);
      await contract.onExecution(sellAmount, purchasedAmount);
      expect((await contract.baseTokenBalanceOf(userWallet.address)).toNumber()).to.be.equals(0);
    });

    it("Order balance updated for single user", async function () {
      const purchasedAmount = 100;
      const sellAmount = 1000;
      await contractAsUser.createAccount(sellAmount, 2);
      expect((await contract.orderTokenBalanceOf(userWallet.address)).toNumber()).to.be.equals(0);
      await contract.onExecution(sellAmount, purchasedAmount);
      expect((await contract.orderTokenBalanceOf(userWallet.address)).toNumber()).to.be.equals(purchasedAmount);
      await contract.onExecution(sellAmount, purchasedAmount);
      expect((await contract.orderTokenBalanceOf(userWallet.address)).toNumber()).to.be.equals(2 * purchasedAmount);
    });

    async function testBalances(
      sellAmountsString: string[],
      purchasedAmountsString: string[],
      results: string[],
      usersBaseBalance: string[],
      usersOrderBalance: string[],
    ) {
      const sellAmounts: BigNumber[] = sellAmountsString.map(BigNumber.from);
      const purchasedAmounts: BigNumber[] = purchasedAmountsString.map(BigNumber.from);
      await mockBaseToken.transfer(userWallet.address, utils.parseEther("100000000000000"));
      await mockBaseToken.transfer(userWallet2.address, utils.parseEther("100000000000000"));
      // Pre-approve contract for transfers on users behalf
      await mockBaseTokenAsUser.approve(contract.address, utils.parseEther("100000000000000"));
      await mockBaseTokenAsUser2.approve(contract.address, utils.parseEther("100000000000000"));
      await mockBaseToken.transfer(userWallet3.address, sellAmounts[2].mul(BigNumber.from(10)));
      await mockBaseTokenAsUser3.approve(contract.address, sellAmounts[2].mul(BigNumber.from(10)));
      await contractAsUser.createAccount(sellAmounts[0], 2);
      const totalSale1 = sellAmounts[0];

      await contract.onExecution(totalSale1, purchasedAmounts[0]);

      expect((await contract.orderTokenBalanceOf(userWallet.address)).toString()).to.be.eq(results[0]);
      expect((await contract.usersBaseTokenBalance()).toString()).to.be.eq(usersBaseBalance[0]);
      expect((await contract.usersOrderTokenBalance()).toString()).to.be.eq(usersOrderBalance[0]);
      await contractAsUser2.createAccount(sellAmounts[1], 2);
      const totalSale2 = sellAmounts[0].add(sellAmounts[1]);

      await contract.onExecution(totalSale2, purchasedAmounts[1]);

      expect((await contract.orderTokenBalanceOf(userWallet.address)).toString()).to.be.eq(results[1]);
      expect((await contract.orderTokenBalanceOf(userWallet2.address)).toString()).to.be.eq(results[2]);
      expect((await contract.usersBaseTokenBalance()).toString()).to.be.eq(usersBaseBalance[1]);
      expect((await contract.usersOrderTokenBalance()).toString()).to.be.eq(usersOrderBalance[1]);
      await contractAsUser3.createAccount(sellAmounts[2], 1);
      const totalSale3 = sellAmounts[1].add(sellAmounts[2]);

      await contract.onExecution(totalSale3, purchasedAmounts[2]);

      expect((await contract.orderTokenBalanceOf(userWallet.address)).toString()).to.be.eq(results[1]);
      expect((await contract.orderTokenBalanceOf(userWallet2.address)).toString()).to.be.eq(results[3]);
      expect((await contract.orderTokenBalanceOf(userWallet3.address)).toString()).to.be.eq(results[4]);
      expect((await contract.usersBaseTokenBalance()).toString()).to.be.eq(usersBaseBalance[2]);
      expect((await contract.usersOrderTokenBalance()).toString()).to.be.eq(usersOrderBalance[2]);
    }

    it("Order balance updated for multiple users", async () =>
      testBalances(
        ["1200", "666", "220"],
        ["50", "100", "40"],
        ["49", "114", "35", "65", "9"],
        ["1200", "666", "0"],
        ["50", "150", "190"],
      ));

    it("Order balance updated for multiple users with large order token amounts", async () =>
      testBalances(
        ["1200", "666", "220"],
        [powerOfTen("1", "30"), powerOfTen("3", "29"), powerOfTen("5", "28")],
        [
          "999999999999999999999999999999",
          "1192926045016077170418006430868",
          "107073954983922829581993569131",
          "144658605096789646737749776806",
          "12415349887133182844243792325",
        ],
        ["1200", "666", "0"],
        [powerOfTen("1", "30"), powerOfTen("13", "29"), powerOfTen("135", "28")],
      ));

    it("Order balance updated for multiple users with large base token amounts", async () => {
      // We need to re-deploy the vault because we need a larger scaling factor for these inputs
      contract = (await deployContract(deployerWallet, DCAVaultABI)) as DcaVault;
      await scheduler.addVault(contract.address);
      await contract.addScheduler(deployerWallet.address);

      await contract.initialize(
        mockBuyStrategy.address,
        mockBaseToken.address,
        mockOrderToken.address,
        scheduler.address,
        PERIOD_IN_S,
        powerOfTen("1", "27"), //Compress enought to allow large values
      );
      contractAsUser = contract.connect(userWallet);
      contractAsUser2 = contract.connect(userWallet2);
      contractAsUser3 = contract.connect(userWallet3);

      await testBalances(
        [powerOfTen("1", "30"), powerOfTen("3", "29"), powerOfTen("5", "28")],
        ["1200", "666", "220"],
        ["1200", "1712", "153", "342", "31"],
        [powerOfTen("1", "30"), powerOfTen("3", "29"), "0"],
        ["1200", "1866", "2086"],
      );
    });
  });

  describe("Dust and internal balances accounting", async function () {
    it("Sends dust to payee respecting users' base token balance", async function () {
      const usersBalance = 1000;
      const cycles = 2;
      await contractAsUser.createAccount(usersBalance / cycles, cycles);
      await mockBaseToken.transfer(contract.address, 100);
      await mockOrderToken.transfer(contract.address, 200);
      const intialEthBalance = await executorWallet.getBalance();
      await deployerWallet.sendTransaction({
        to: contract.address,
        value: utils.parseEther("1.0"),
      });
      await contract.collectDust([mockOrderToken.address, mockBaseToken.address], executorWallet.address);

      // Users balance stored in the contract is not touched
      expect((await mockBaseToken.balanceOf(contract.address)).toNumber()).to.be.equals(usersBalance);
      // Base token dust sent to recipient
      expect((await mockBaseToken.balanceOf(executorWallet.address)).toNumber()).to.be.equals(100);
      // Order token dust sent to recipient
      expect((await mockOrderToken.balanceOf(executorWallet.address)).toNumber()).to.be.equals(200);
      // Eth balance sent to recipient
      expect((await executorWallet.getBalance()).sub(intialEthBalance).toString()).to.be.equals(
        utils.parseEther("1.0").toString(),
      );
    });

    it("Sends dust to payee respecting users' order token balance", async function () {
      const orderTokenPurchased = 66;
      await mockBuyStrategy.setAmounts(0, orderTokenPurchased);
      const sellAmountPerPeriod = 1000;
      const expectedUserBaseTokenBalance = 1000;
      const cycles = 2;
      await contractAsUser.createAccount(sellAmountPerPeriod, cycles);
      await mockBaseToken.transfer(contract.address, 100);
      await mockOrderToken.transfer(contract.address, 200);

      await contract.onExecution(1000, orderTokenPurchased);

      const intialEthBalance = await executorWallet.getBalance();

      await deployerWallet.sendTransaction({
        to: contract.address,
        value: utils.parseEther("1.0"),
      });

      await contract.collectDust([mockOrderToken.address, mockBaseToken.address], executorWallet.address);

      // Users balance stored in the contract is not touched
      expect((await mockBaseToken.balanceOf(contract.address)).toNumber()).to.be.equals(expectedUserBaseTokenBalance);
      expect((await mockOrderToken.balanceOf(contract.address)).toNumber()).to.be.equals(orderTokenPurchased);
      // Base token dust sent to recipient
      expect((await mockBaseToken.balanceOf(executorWallet.address)).toNumber()).to.be.equals(1100);
      // Order token dust sent to recipient
      expect((await mockOrderToken.balanceOf(executorWallet.address)).toNumber()).to.be.equals(
        200 - orderTokenPurchased,
      );
      // Eth balance sent to recipient
      expect((await executorWallet.getBalance()).sub(intialEthBalance).toString()).to.be.equals(
        utils.parseEther("1.0").toString(),
      );
    });
  });

  describe("ACL", async function () {
    it("Allows admin to set withdrawal strategy", async function () {
      const withdrawalStrategy = (await waffle.deployMockContract(
        deployerWallet,
        WithdrawalStrategyABI.abi,
      )) as MockContract;
      await expect(contract.setWithdrawalStrategy(withdrawalStrategy.address)).not.to.be.reverted;
    });

    it("Forbids non admin to set withdrawal strategy", async function () {
      const withdrawalStrategy = (await waffle.deployMockContract(
        deployerWallet,
        WithdrawalStrategyABI.abi,
      )) as MockContract;
      await expect(contractAsUser.setWithdrawalStrategy(withdrawalStrategy.address)).to.be.revertedWith(
        "DCA: ACCESS_DENIED",
      );
    });

    it("Forbids re-initialize", async function () {
      await expect(
        contractAsUser.initialize(
          mockBuyStrategy.address,
          mockOrderToken.address,
          mockBaseToken.address,
          scheduler.address,
          PERIOD_IN_S,
          1,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("Allows admin to set min quantity", async function () {
      await expect(contract.setMinQty(100)).not.to.be.reverted;
    });

    it("Forbids non admin to set min quantity", async function () {
      await expect(contractAsUser.setMinQty(100)).to.be.revertedWith("DCA: ACCESS_DENIED");
    });

    it("Allows admin to collect dust", async function () {
      await expect(contract.collectDust([mockOrderToken.address], userWallet.address)).not.to.be.reverted;
    });

    it("Forbids non admin to collect dust", async function () {
      await expect(contractAsUser.collectDust([mockOrderToken.address], userWallet.address)).to.be.revertedWith(
        "DCA: ACCESS_DENIED",
      );
    });
  });
});
const powerOfTen = (n: string, exp: string) => BigNumber.from(n).mul(BigNumber.from("10").pow(exp)).toString();
