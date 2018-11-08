/* eslint no-underscore-dangle: ["error", { "allow": ["_pollTransactionReceipt"] }] */
import test from "ava";
import web3 from "../../utils/lib/web3";
import { retrieveContract } from "../../utils/lib/contracts";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const performanceFeeRate = new BigNumber(10 ** 17);
const managementFeeRate = new BigNumber(0);

BigNumber.config({ ERRORS: false });

// TODO: factor out redundant assertions
// TODO: factor out tests into multiple files
// Using contract name directly instead of nameContract as in other tests as they are already deployed
let accounts;
let deployer;
let manager;
let investor;
let secondInvestor;
let mlnToken;
let ethToken;
let fund;
let version;
let deployed;
let accumulatedPFeeAtPeak;

BigNumber.config({ ERRORS: false });

async function requestAndExecute(from, offeredValue, wantedShares) {
  await ethToken.methods.approve(fund.options.address, offeredValue).send(
    { from, gasPrice: config.gasPrice },
  );
  await fund.methods.requestInvestment(offeredValue, wantedShares, ethToken.options.address).send(
    { from, gas: config.gas, gasPrice: config.gasPrice },
  );
  await updateCanonicalPriceFeed(deployed);
  await updateCanonicalPriceFeed(deployed);
  const requestId = await fund.methods.getLastRequestId().call();
  // console.log(await fund.methods.calcRedemptionSharePriceAndAllocateFees().call());
  await fund.methods.executeRequest(requestId).send(
    { from, gas: config.gas, gasPrice: config.gasPrice },
  );
}

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, secondInvestor] = accounts;
  version = deployed.Version;
  mlnToken = deployed.MlnToken;
  ethToken = deployed.EthToken;
  await ethToken.methods.transfer(investor, new BigNumber(10 ** 25)).send(
    { from: deployer, gasPrice: config.gasPrice },
  );
  await ethToken.methods.transfer(secondInvestor, new BigNumber(10 ** 25)).send(
    { from: deployer, gasPrice: config.gasPrice },
  );
});

// Setup
// For unique fundName on each test run
const fundName = "MelonPortfolio";
test.serial("can set up new fund", async t => {
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods.setupFund(
    web3.utils.toHex(fundName), // name
    ethToken.options.address, // base asset
    managementFeeRate,
    performanceFeeRate,
    1,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.MatchingMarket.options.address],
    [mlnToken.options.address],
    v,
    r,
    s,
  ).send({ from: manager, gas: config.gas });
  // const timestamp = (await web3.eth.getBlock(receipt.blockNumber)).timestamp;
  // atLastUnclaimedFeeAllocation = new Date(timestamp).valueOf();

  const fundId = await version.methods.getLastFundId().call();
  const fundAddress = await version.methods.getFundById(fundId).call();
  fund = await retrieveContract("Fund", fundAddress);

  t.deepEqual(Number(fundId), 0);
});

// investment
// TODO: reduce code duplication between this and subsequent tests
// split first and subsequent tests due to differing behaviour
const firstTest = {
  wantedShares: new BigNumber(10 ** 19),
  offeredValue: new BigNumber(10 ** 19)
};

test.serial("allows request and execution on the first investment", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const investorPreShares = new BigNumber(await fund.methods.balanceOf(investor).call());
  await requestAndExecute(investor, firstTest.offeredValue, firstTest.wantedShares);
  const post = await getAllBalances(deployed, accounts, fund);
  const investorPostShares = new BigNumber(await fund.methods.balanceOf(investor).call());

  t.deepEqual(
    investorPostShares,
    investorPreShares.add(firstTest.wantedShares),
  );
  t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.deepEqual(
    post.investor.EthToken,
    pre.investor.EthToken.minus(firstTest.offeredValue),
  );

  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(
    post.fund.EthToken,
    pre.fund.EthToken.add(firstTest.offeredValue),
  );
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("artificially inflate share price", async t => {
  const preSharePrice = new BigNumber(await fund.methods.calcRedemptionSharePrice().call());
  await ethToken.methods.transfer(fund.options.address, firstTest.wantedShares.mul(1.78)).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );
  const postSharePrice = new BigNumber(await fund.methods.calcRedemptionSharePrice().call());
  const gav = new BigNumber(await fund.methods.calcGav().call());
  const totalSupply = new BigNumber(await fund.methods.totalSupply().call());
  const [, performanceFee, unclaimedFees] = Object.values(await fund.methods.calcUnclaimedFees(gav).call()).map(e => new BigNumber(e));;
  const nav = new BigNumber((await fund.methods.performCalculations().call()).nav);

  // Share price calculation using other formula (nav / totalSupply)
  const sharePriceUsingNav= nav.mul(10 ** 18).div(totalSupply);
  const sharePriceUsingGav= gav.sub(unclaimedFees).mul(10 ** 18).div(totalSupply);

  t.true(Number(postSharePrice) > Number(preSharePrice));
  t.true(performanceFee > 0);
  t.deepEqual(postSharePrice, sharePriceUsingNav);
  t.deepEqual(postSharePrice, sharePriceUsingGav);
});

test.serial("new investment should not affect share price", async t => {
  const preSharePrice = new BigNumber(await fund.methods.calcRedemptionSharePrice().call());
  const sharePriceExclFees = new BigNumber(await fund.methods.calcInvestmentSharePrice().call());
  await requestAndExecute(investor, firstTest.wantedShares.mul(sharePriceExclFees).div(10 ** 18), firstTest.wantedShares);
  const postSharePrice = new BigNumber(await fund.methods.calcRedemptionSharePrice().call());
  accumulatedPFeeAtPeak = new BigNumber((await fund.methods.performCalculations().call()).performanceFee);
  t.deepEqual(preSharePrice, postSharePrice);
});

test.serial("redemption should not affect share price", async t => {
  const preSharePrice = new BigNumber(await fund.methods.calcRedemptionSharePrice().call());
  await fund.methods.redeemAllOwnedAssets(firstTest.wantedShares).send(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
  );
  // const managerShares = new BigNumber(await fund.methods.balanceOf(manager).call());
  const postSharePrice = new BigNumber(await fund.methods.calcRedemptionSharePrice().call());
  t.deepEqual(preSharePrice, postSharePrice);
});

test.serial("performance fee calculation is accurate", async t => {
  // Keep track of fees shares before HWM Update
  const sharePriceExclFees = new BigNumber(await fund.methods.calcInvestmentSharePrice().call());
  const initialSharePrice = new BigNumber(10 ** 18);
  const gainInSharePrice = sharePriceExclFees.sub(initialSharePrice);
  const totalSupply = new BigNumber(await fund.methods.totalSupply().call());
  const investmentProfits = gainInSharePrice.mul(totalSupply).div(10 ** 18);
  const expectedFee = investmentProfits.mul(performanceFeeRate).div(10 ** 18);
  const actualFee = new BigNumber((await fund.methods.performCalculations().call()).performanceFee);
  t.deepEqual(expectedFee, actualFee);
});

test.serial("highwatermark update doesn't affect share price", async t => {
  const preSharePrice = new BigNumber(await fund.methods.calcRedemptionSharePrice().call());
  const accumulatedFeesShares = new BigNumber((await fund.methods.performCalculations().call()).feesShareQuantity);
  const preManagerShares = new BigNumber(await fund.methods.balanceOf(manager).call());
  await fund.methods.calculateHighWaterMark().send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
  );
  const postSharePrice = new BigNumber(await fund.methods.calcRedemptionSharePrice().call());
  const postManagerShares = new BigNumber(await fund.methods.balanceOf(manager).call());
  t.deepEqual(preSharePrice, postSharePrice);
  t.deepEqual(postManagerShares.sub(preManagerShares), accumulatedFeesShares);
});


test.serial("manager converts his shares", async t => {
  const managerShares = new BigNumber(await fund.methods.balanceOf(manager).call());
  await fund.methods.redeemAllOwnedAssets(managerShares).send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
  );
  const managerEthToken = new BigNumber(await ethToken.methods.balanceOf(manager).call());
  t.deepEqual(Number(managerEthToken.sub(accumulatedPFeeAtPeak)), 0);
});
