import { waffle } from "hardhat";
import TestGasABI from "../../artifacts/contracts/mocks/TestGas.sol/TestGas.json";
import { TestGas } from "../../typechain/TestGas";

describe("Gas", function () {
  let contract: TestGas;

  const provider = waffle.provider;
  const [deployerWallet] = provider.getWallets();
  const { deployContract } = waffle;

  beforeEach(async () => {
    contract = (await deployContract(deployerWallet, TestGasABI)) as TestGas;
  });

  describe("Gas", async function () {
    it("Calculates gas", async function () {
      await contract.init();
      await contract.addToSlotsSchedule(0, 0, 100, 100);
      await contract.addToSlotsSchedule(50, 100, 300, 100);
      // await contract.addToSlots(100, 255);
      // console.log(await contract.getSlots32());
      // console.log(await contract.getSchedule());
      // await contract.addToSlots(100, 100);
      // await contract.addToSlots(100, 20);
      // await contract.addToSlots(100, 10);
      // await contract.addToSlots(100, 200);
    });
  });
});
