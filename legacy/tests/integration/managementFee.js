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
const performanceFeeRate = new BigNumber(0);
const managementFeeRate = new BigNumber(5 * 10 ** 16);

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
let totalAccumulatedMgmtFee = 0;
let totalAccumulatedShares = 0;

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
  // console.log(await fund.methods.calcSharePriceAndAllocateFees().call());
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

test.serial("new investment accrues management fee correctly", async t => {
  const {investmentSharePrice, timestamp: timestampAtLastConversion} = await fund.methods.atLastManagementFeeAllocation().call();
  const pre = await getAllBalances(deployed, accounts, fund);
  firstTest.offeredValue = firstTest.wantedShares.mul(investmentSharePrice).div(10 ** 18);
  await requestAndExecute(investor, firstTest.offeredValue, firstTest.wantedShares);
  const post = await getAllBalances(deployed, accounts, fund);
  const {gav: gavAtConversion, investmentSharePrice: actualInvestmentSharePrice, totalSupply: totalSupplyAtConversion, managementFee: mgmtFeeAtConversion, timestamp: timestampAtConversion} = await fund.methods.atLastManagementFeeAllocation().call();
  const timedelta = Number(timestampAtConversion) - Number(timestampAtLastConversion);
  const accumulatedMgmtFee = new BigNumber(gavAtConversion).mul(timedelta).div(31536000).mul(managementFeeRate).div(10 ** 18).round();
  const feeShares = accumulatedMgmtFee.mul(totalSupplyAtConversion).div(gavAtConversion);
  const feeSharesInflate = feeShares.mul(totalSupplyAtConversion).div(new BigNumber(totalSupplyAtConversion).sub(feeShares));
  totalAccumulatedShares += Number(feeSharesInflate);
  totalAccumulatedMgmtFee += Number(accumulatedMgmtFee);
  t.deepEqual(Number(mgmtFeeAtConversion), Number(accumulatedMgmtFee));
  t.deepEqual(pre.investor.EthToken.sub(post.investor.EthToken), firstTest.wantedShares.mul(actualInvestmentSharePrice).div(10 ** 18));
  t.true(Number(actualInvestmentSharePrice) < Number(investmentSharePrice));
});

test.serial("redemption accrues management fee correctly", async t => {
  const {timestamp: timestampAtLastConversion} = await fund.methods.atLastManagementFeeAllocation().call();
  await fund.methods.redeemAllOwnedAssets(firstTest.wantedShares).send(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
  );
  const {gav: gavAtConversion, totalSupply: totalSupplyAtConversion, managementFee: mgmtFeeAtConversion, timestamp: timestampAtConversion} = await fund.methods.atLastManagementFeeAllocation().call();
  const timedelta = Number(timestampAtConversion) - Number(timestampAtLastConversion);
  const accumulatedMgmtFee = new BigNumber(gavAtConversion).mul(timedelta).div(31536000).mul(managementFeeRate).div(10 ** 18).round();
  const feeShares = accumulatedMgmtFee.mul(totalSupplyAtConversion).div(gavAtConversion);
  const feeSharesInflate = feeShares.mul(totalSupplyAtConversion).div(new BigNumber(totalSupplyAtConversion).sub(feeShares));
  totalAccumulatedShares += Number(feeSharesInflate);
  totalAccumulatedMgmtFee += Number(accumulatedMgmtFee);
  t.deepEqual(Number(mgmtFeeAtConversion), Number(accumulatedMgmtFee));
});

test.serial("manager converts his shares", async t => {
  const {timestamp: timestampAtLastConversion} = await fund.methods.atLastManagementFeeAllocation().call();
  const managerShares = new BigNumber(await fund.methods.balanceOf(manager).call());
  await fund.methods.redeemAllOwnedAssets(managerShares).send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
  );
  const {gav: gavAtConversion, totalSupply: totalSupplyAtConversion, managementFee: mgmtFeeAtConversion, timestamp: timestampAtConversion} = await fund.methods.atLastManagementFeeAllocation().call();
  const timedelta = Number(timestampAtConversion) - Number(timestampAtLastConversion);
  const accumulatedMgmtFee = new BigNumber(gavAtConversion).mul(timedelta).div(31536000).mul(managementFeeRate).div(10 ** 18).round();
  const managerEthToken = new BigNumber(await ethToken.methods.balanceOf(manager).call());
  // const feeShares = accumulatedMgmtFee.mul(totalSupplyAtConversion).div(gavAtConversion);
  // const feeSharesInflate = feeShares.mul(totalSupplyAtConversion).div(new BigNumber(totalSupplyAtConversion).sub(feeShares));
  // totalAccumulatedShares += Number(feeSharesInflate);
  // totalAccumulatedMgmtFee += Number(accumulatedMgmtFee);
  t.deepEqual(Number(managerShares), Math.floor(totalAccumulatedShares))
  t.deepEqual(Number(mgmtFeeAtConversion), Number(accumulatedMgmtFee));
  t.deepEqual(Number(managerEthToken), Math.floor(totalAccumulatedMgmtFee));
});
