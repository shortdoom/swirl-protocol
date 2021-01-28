import { expect } from "chai";
import { MockContract } from "ethereum-waffle";
import { utils } from "ethers";
import { waffle } from "hardhat";
import ChainLinkFeedABI from "../../artifacts/contracts/interfaces/IChainLinkFeed.sol/IChainLinkFeed.json";
import PriceFeedConsumerABI from "../../artifacts/contracts/libs/PriceFeedConsumer.sol/PriceFeedConsumer.json";
import { PriceFeedConsumer } from "../../typechain/PriceFeedConsumer";
import { A_NON_ZERO_ADDRESS } from "../utils/utils";

const TOKEN_A = "0x53bff74b9af2e3853f758a8d2bd61cd115d27782";
const TOKEN_B = "0xfd8eb95169ce57eab52fb69bc6922e9b6454d9aa";

describe("Price Feed Consumer", function () {
  let contract: PriceFeedConsumer;
  let contractAsUser: PriceFeedConsumer;
  let mockPriceFeed: MockContract;

  const provider = waffle.provider;
  const [deployerWallet, userWallet] = provider.getWallets();
  const { deployMockContract, deployContract } = waffle;

  beforeEach(async () => {
    mockPriceFeed = await deployMockContract(deployerWallet, ChainLinkFeedABI.abi);
    contract = (await deployContract(deployerWallet, PriceFeedConsumerABI)) as PriceFeedConsumer;
    contractAsUser = contract.connect(userWallet);
  });

  describe("Amount conversion", async function () {
    async function testExpectedAndInverseAmount(
      feedDecimal: number,
      tokenADecimal: number,
      tokenBDecimal: number,
      expectedAmount: string,
      expectedInverseAmount: string,
    ) {
      await mockPriceFeed.mock.decimals.returns(feedDecimal);
      await mockPriceFeed.mock.latestAnswer.returns(utils.parseUnits("2", feedDecimal));
      await contract.addFeed(TOKEN_A, TOKEN_B, mockPriceFeed.address, tokenADecimal, tokenBDecimal);
      const actualAmount = await contract.expectedAmountWithOraclePrice(
        TOKEN_A,
        TOKEN_B,
        utils.parseUnits("100", tokenADecimal),
      );
      expect(actualAmount.eq(utils.parseUnits(expectedAmount, tokenBDecimal))).to.be.true;
      // We don't change the price returned by the mock as we only care about decimals
      const actualInverseAmount = await contract.expectedAmountWithOraclePrice(
        TOKEN_B,
        TOKEN_A,
        utils.parseUnits("100", tokenBDecimal),
      );
      expect(actualInverseAmount.eq(utils.parseUnits(expectedInverseAmount, tokenADecimal))).to.be.true;
    }

    it("Calculates correct amounts when decimals all the same", async () =>
      testExpectedAndInverseAmount(18, 18, 18, "200", "50"));
    it("Calculates correct amounts when feed decimal is different", async () =>
      testExpectedAndInverseAmount(8, 18, 18, "200", "50"));
    it("Calculates correct amounts when all decimal are different", async () =>
      testExpectedAndInverseAmount(8, 10, 12, "200", "50"));

    it("Returns 0 if no feed available", async function () {
      const actualAmount = await contract.expectedAmountWithOraclePrice(TOKEN_A, TOKEN_B, utils.parseUnits("100", 18));
      expect(actualAmount.isZero()).to.be.true;
    });
  });

  describe("ACL", async function () {
    it("Does not allow adding feed by non admin", async function () {
      await expect(contractAsUser.addFeed(TOKEN_A, TOKEN_B, A_NON_ZERO_ADDRESS, 18, 18)).to.be.revertedWith(
        "DCA: ACCESS_DENIED",
      );
    });
  });
});
