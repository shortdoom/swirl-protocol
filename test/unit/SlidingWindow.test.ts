import { expect } from "chai";
import { BigNumber, constants } from "ethers";
import { waffle } from "hardhat";
import SlidingWindow from "../../artifacts/contracts/mocks/SlidingWindowTest.sol/SlidingWindowTest.json";
import { SlidingWindowTest } from "../../typechain/SlidingWindowTest";
import { isNotZero, toNumber } from "../utils/utils";

const INITIAL_SCALING_FACTOR = constants.One;

describe("Sliding Window", function () {
  let contract: SlidingWindowTest;
  let size: number;

  const provider = waffle.provider;
  const [wallet] = provider.getWallets();
  const { deployContract } = waffle;

  beforeEach(async () => {
    contract = (await deployContract(wallet, SlidingWindow, [INITIAL_SCALING_FACTOR])) as SlidingWindowTest;
    size = (await contract.size()).toNumber();
  });

  async function assertWindowIs(expectedWindow: number[]) {
    const actualWindow = (await contract.toArray()).map(toNumber).filter(isNotZero);
    expect(actualWindow).to.be.eql(expectedWindow);
  }

  async function getLastWritableIndex() {
    const nextIndex = await contract.nextIndex();
    return nextIndex + size;
  }

  describe("Initialization", async function () {
    it("Initializes scaling factor correctly", async function () {
      expect(await contract.scalingFactor()).eq(constants.One);
    });

    it("Initializes next index correctly", async function () {
      expect(await contract.nextIndex()).eq(constants.One);
    });

    it("Initializes values correctly", async function () {
      await assertWindowIs([]);
    });
  });

  describe("Validation", async function () {
    it("Rejects edits if previous range greater than size", async function () {
      await expect(contract.edit(1, (await getLastWritableIndex()) + 1, 0, 0)).to.be.revertedWith(
        "SW:WRITE_OUT_OF_BOUNDS",
      );
    });

    it("Rejects edits if new range greater than size", async function () {
      await expect(contract.edit(0, 0, 1, (await getLastWritableIndex()) + 1)).to.be.revertedWith(
        "SW:WRITE_OUT_OF_BOUNDS",
      );
    });

    it("Fails when scaled new edit value greater than maximum compressed value", async function () {
      await expect(contract.edit(0, 0, BigNumber.from("2").pow(BigNumber.from("65")), 3)).to.be.revertedWith(
        "SafeCast: value doesn't fit in 64 bits",
      );
    });

    it("Fails when scaled previous edit value greater than total value stored", async function () {
      await expect(contract.edit(1, 3, 0, 0)).to.be.revertedWith("SafeMath: subtraction overflow");
    });

    it("Fails when next value not present", async function () {
      await expect(contract.next()).to.be.revertedWith("SW:READ_OUT_OF_BOUNDS");
    });
  });

  describe("Compression", async function () {
    it("Compresses and decompresses value correctly with factor 10^2", async function () {
      const factor = BigNumber.from("10").pow(BigNumber.from("2"));
      await contract.setScalingFactor(factor);
      await contract.edit(0, 0, factor.mul(2345), 2);
      expect((await contract.peek()).eq(factor.mul(2345))).to.be.true;
    });

    it("Compresses and decompresses value correctly with factor 10^4", async function () {
      const factor = BigNumber.from("10").pow(BigNumber.from("4"));
      await contract.setScalingFactor(factor);
      await contract.edit(0, 0, factor.mul(2345), 2);
      expect((await contract.peek()).eq(factor.mul(2345))).to.be.true;
    });

    it("Compresses and decompresses value correctly with factor 10^8", async function () {
      const factor = BigNumber.from("10").pow(BigNumber.from("8"));
      await contract.setScalingFactor(factor);
      await contract.edit(0, 0, factor.mul(2345), 2);
      expect((await contract.peek()).eq(factor.mul(2345))).to.be.true;
    });

    it("Compresses and decompresses value correctly with factor 10^32", async function () {
      const factor = BigNumber.from("10").pow(BigNumber.from("32"));
      await contract.setScalingFactor(factor);
      await contract.edit(0, 0, factor.mul(2345), 2);
      expect((await contract.peek()).eq(factor.mul(2345))).to.be.true;
    });

    it("Fails when previous edit value less than minimum compressed value", async function () {
      await contract.setScalingFactor(10);
      await expect(contract.edit(1, 3, 0, 0)).to.be.revertedWith("SW:QTY_UNDERFLOW");
    });
    it("Fails when new edit value less than minimum compressed value", async function () {
      await contract.setScalingFactor(10);
      await expect(contract.edit(0, 0, 1, 3)).to.be.revertedWith("SW:QTY_UNDERFLOW");
    });
  });

  describe("Window values", async function () {
    it("Empty window on null edit", async function () {
      await contract.edit(0, 0, 0, 0);
      await assertWindowIs([]);
    });

    it("Sets correct values for single addition", async function () {
      await contract.edit(0, 0, 1, 5);
      await assertWindowIs([1, 1, 1, 1]);
    });

    it("Sets correct values for single addition with max size", async function () {
      await contract.edit(0, 0, 1, await getLastWritableIndex());
      await assertWindowIs(Array(size).fill(1));
    });

    it("Sets correct values for single addition and edit", async function () {
      await contract.edit(0, 0, 2, 5);
      await assertWindowIs([2, 2, 2, 2]);
      await contract.edit(1, 5, 3, 7);
      /*
       * [2,2,2,2] -
       * [1,1,1,1] +
       * [3,3,3,3,3,3] =
       */
      await assertWindowIs([4, 4, 4, 4, 3, 3]);
    });

    it("Consumes all available values", async function () {
      await contract.edit(0, 0, 1, 10);
      for (let i = 1 /*initial index*/; i < 10; i++) {
        await contract.next();
      }
      expect(await contract.hasNext()).to.be.false;
    });

    it("Sets correct values for additions twice max size", async function () {
      await contract.edit(0, 0, 1, await getLastWritableIndex());
      expect(await contract.peek()).eq(1);
      while (await contract.hasNext()) {
        expect(await contract.peek()).eq(1);
        await contract.next();
      }
      expect(await contract.peek()).eq(0);
      const lastWritableIndex = await getLastWritableIndex();
      // (initial index) 1 + 256 + 256
      expect(lastWritableIndex).eq(1 + size * 2);

      await contract.edit(0, 0, 3, lastWritableIndex);

      await assertWindowIs(Array(size).fill(3));
    });

    it("Sets correct values for edit consume edit", async function () {
      await contract.edit(0, 0, 1, 5);
      await assertWindowIs([1, 1, 1, 1]);
      for (let i = 1 /*initial index*/; i < 3; i++) {
        await contract.next();
      }
      await assertWindowIs([1, 1]);
      await contract.edit(1, 4, 3, 6);
      /*
       * [1,1,1,1] -
       *     [1,0,0] +
       *     [3,3,3] =
       */
      await assertWindowIs([3, 4, 3]);
    });
  });
});
