/* eslint no-underscore-dangle: ["error", { "allow": ["_pollTransactionReceipt"] }] */
import test from "ava";
import api from "../../utils/lib/api";
import { retrieveContract } from "../../utils/lib/contracts";
import deployEnvironment from "../../utils/deploy/contracts";
import calcSharePriceAndAllocateFees from "../../utils/lib/calcSharePriceAndAllocateFees";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateCanonicalPriceFeed } from "../../utils/lib/updatePriceFeed";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

BigNumber.config({ ERRORS: false });

// TODO: factor out redundant assertions
// TODO: factor out tests into multiple files
// Using contract name directly instead of nameContract as in other tests as they are already deployed
let accounts;
let deployer;
let gasPrice;
let manager;
let investor;
let opts;
let mlnToken;
let ethToken;
let txId;
let runningGasTotal;
let fund;
let version;
let pricefeed;
let deployed;
let atLastUnclaimedFeeAllocation;

BigNumber.config({ ERRORS: false });

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor] = accounts;
  version = deployed.Version;
  pricefeed = await deployed.CanonicalPriceFeed;
  mlnToken = deployed.MlnToken;
  ethToken = deployed.EthToken;
  gasPrice = Number(await api.eth.gasPrice());
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
});

test.beforeEach(() => {
  runningGasTotal = new BigNumber(0);
});

// Setup
// For unique fundName on each test run
const fundName = "MelonPortfolio";
test.serial("can set up new fund", async t => {
  const preManagerEth = new BigNumber(await api.eth.getBalance(manager));
  const [r, s, v] = await getTermsSignatureParameters(manager);
  txId = await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      fundName, // name
      ethToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      [deployed.MatchingMarket.address],
      [mlnToken.address],
      v,
      r,
      s,
    ],
  );
  const block = await api.eth.getTransactionReceipt(txId);
  const timestamp = (await api.eth.getBlockByNumber(block.blockNumber))
    .timestamp;
  atLastUnclaimedFeeAllocation = new Date(timestamp).valueOf();
  await version._pollTransactionReceipt(txId);

  // Since postTransaction returns transaction hash instead of object as in Web3
  const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const fundId = await version.instance.getLastFundId.call({}, []);
  const fundAddress = await version.instance.getFundById.call({}, [fundId]);
  fund = await retrieveContract("Fund", fundAddress);
  const postManagerEth = new BigNumber(await api.eth.getBalance(manager));
  // Change competition address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.instance.changeCompetitionAddress.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [investor],
  );

  t.deepEqual(
    postManagerEth,
    preManagerEth.minus(runningGasTotal.times(gasPrice)),
  );
  t.deepEqual(Number(fundId), 0);
  // t.deepEqual(postManagerEth, preManagerEth.minus(runningGasTotal.times(gasPrice)));
});

test.serial("initial calculations", async t => {
  await updateCanonicalPriceFeed(deployed);
  const [
    gav,
    managementFee,
    performanceFee,
    unclaimedFees,
    feesShareQuantity,
    nav,
    sharePrice,
  ] = Object.values(await fund.instance.performCalculations.call(opts, []));

  t.deepEqual(Number(gav), 0);
  t.deepEqual(Number(managementFee), 0);
  t.deepEqual(Number(performanceFee), 0);
  t.deepEqual(Number(unclaimedFees), 0);
  t.deepEqual(Number(feesShareQuantity), 0);
  t.deepEqual(Number(nav), 0);
  t.deepEqual(Number(sharePrice), 10 ** 18);
});
const initialTokenAmount = new BigNumber(10 ** 23);
test.serial("investor receives initial mlnToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const preDeployerEth = new BigNumber(await api.eth.getBalance(deployer)); // TODO: this is now in getAllBalances
  txId = await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    postDeployerEth.toString(),
    preDeployerEth.minus(runningGasTotal.times(gasPrice)).toString(),
  );
  t.deepEqual(
    post.investor.MlnToken,
    pre.investor.MlnToken.add(initialTokenAmount),
  );

  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

/*
// TODO: this one may be more suitable to a unit test
test.serial.skip('direct transfer of a token to the Fund is rejected', async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await mlnToken.instance.transfer.postTransaction(
    { from: investor, gasPrice: config.gasPrice },
    [fund.address, 1000, ""]
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
});
*/

// TODO: this one may be more suitable to a unit test
// TODO: remove skip when we re-introduce fund name tracking
test.serial(
  "a new fund with a name used before cannot be created",
  async t => {
    const [r, s, v] = await getTermsSignatureParameters(deployer);
    const preFundId = await version.instance.getLastFundId.call({}, []);
    txId = await version.instance.setupFund.postTransaction(
      { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
      [
        fundName, // same name as before
        mlnToken.address, // base asset
        config.protocol.fund.managementFee,
        config.protocol.fund.performanceFee,
        deployed.NoCompliance.address,
        deployed.RMMakeOrders.address,
        [deployed.MatchingMarket.address],
        [],
        v,
        r,
        s,
      ],
    );
    await version._pollTransactionReceipt(txId);
    const newFundAddress = await version.instance.getFundByManager.call({}, [
      deployer,
    ]);
    const postFundId = await version.instance.getLastFundId.call({}, []);

    t.is(Number(preFundId), Number(postFundId));
    t.is(newFundAddress, "0x0000000000000000000000000000000000000000");
  },
);

// investment
// TODO: reduce code duplication between this and subsequent tests
// split first and subsequent tests due to differing behaviour
const firstTest = { wantedShares: new BigNumber(2000) };

const subsequentTests = [
  { wantedShares: new BigNumber(10 ** 18) },
  { wantedShares: new BigNumber(0.5 * 10 ** 18) },
];

async function calculateOfferValue(wantedShares) {
  // new
  const [
    ,
    invertedPrice,
    assetDecimals
  ] = await pricefeed.instance.getInvertedPriceInfo.call({}, [
    mlnToken.address
  ]);
  const sharePrice = await fund.instance.calcSharePriceAndAllocateFees.call({}, []);
  const sharesWorth = await fund.instance.toWholeShareUnit.call({}, [sharePrice.mul(wantedShares)]);
  return new BigNumber(Math.round(sharesWorth.mul(invertedPrice).div(10 ** assetDecimals)));
}

test.serial("allows request and execution on the first investment", async t => {
  let investorGasTotal = new BigNumber(0);
  const pre = await getAllBalances(deployed, accounts, fund);
  const fundPreAllowance = await mlnToken.instance.allowance.call({}, [
    investor,
    fund.address,
  ]);
  const offerValue = await calculateOfferValue(firstTest.wantedShares);
  // Offer additional value than market price to avoid price fluctation failures
  firstTest.offeredValue = new BigNumber(Math.round(offerValue.mul(1.1)));
  const inputAllowance = firstTest.offeredValue;
  txId = await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice },
    [fund.address, inputAllowance],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const fundPostAllowance = await mlnToken.instance.allowance.call({}, [
    investor,
    fund.address,
  ]);
  txId = await fund.instance.requestInvestment.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [firstTest.offeredValue, firstTest.wantedShares, mlnToken.address],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const investorPreShares = await fund.instance.balanceOf.call({}, [investor]);
  await updateCanonicalPriceFeed(deployed);
  await updateCanonicalPriceFeed(deployed);
  const requestedSharesTotalValue = await calculateOfferValue(firstTest.wantedShares);
  const offerRemainder = firstTest.offeredValue.minus(requestedSharesTotalValue);
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  txId = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const investorPostShares = await fund.instance.balanceOf.call({}, [investor]);
  // reduce leftover allowance of investor to zero
  txId = await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice },
    [fund.address, 0],
  );
  gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const remainingApprovedMln = Number(
    await mlnToken.instance.allowance.call({}, [investor, fund.address]),
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(remainingApprovedMln, 0);
  t.deepEqual(
    investorPostShares,
    investorPreShares.add(firstTest.wantedShares),
  );
  t.deepEqual(fundPostAllowance, fundPreAllowance.add(inputAllowance));
  t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.deepEqual(
    post.investor.MlnToken,
    pre.investor.MlnToken.minus(firstTest.offeredValue).add(offerRemainder),
  );

  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(
    post.fund.MlnToken,
    pre.fund.MlnToken.add(firstTest.offeredValue).minus(offerRemainder),
  );
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

subsequentTests.forEach(testInstance => {
  let fundPreCalculations;
  let offerRemainder;

  test.serial(
    "funds approved, and invest request issued, but tokens do not change ownership",
    async t => {
      fundPreCalculations = Object.values(
        await fund.instance.performCalculations.call(opts, []),
      );
      const pre = await getAllBalances(deployed, accounts, fund);
      const offerValue = await calculateOfferValue(testInstance.wantedShares);
      // Offer additional value than market price to avoid price fluctation failures
      /* eslint-disable no-param-reassign */
      testInstance.offeredValue = new BigNumber(Math.round(offerValue.mul(1.1)));
      const inputAllowance = testInstance.offeredValue;
      const fundPreAllowance = await mlnToken.instance.allowance.call({}, [
        investor,
        fund.address,
      ]);
      txId = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, inputAllowance],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const fundPostAllowance = await mlnToken.instance.allowance.call({}, [
        investor,
        fund.address,
      ]);

      t.deepEqual(fundPostAllowance, fundPreAllowance.add(inputAllowance));

      txId = await fund.instance.requestInvestment.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [
          testInstance.offeredValue,
          testInstance.wantedShares,
          mlnToken.address,
        ],
      );
      gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    "executing invest request transfers shares to investor, and remainder of investment offer to investor",
    async t => {
      let investorGasTotal = new BigNumber(0);
      await updateCanonicalPriceFeed(deployed);
      await updateCanonicalPriceFeed(deployed);
      const pre = await getAllBalances(deployed, accounts, fund);
      const investorPreShares = await fund.instance.balanceOf.call({}, [
        investor,
      ]);
      const requestId = await fund.instance.getLastRequestId.call({}, []);
      txId = await fund.instance.executeRequest.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [requestId],
      );
      const block = await api.eth.getTransactionReceipt(txId);
      const timestamp = (await api.eth.getBlockByNumber(block.blockNumber))
        .timestamp;
      atLastUnclaimedFeeAllocation = new Date(timestamp).valueOf();
      let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const investorPostShares = await fund.instance.balanceOf.call({}, [
        investor,
      ]);
      // reduce leftover allowance of investor to zero
      txId = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, 0],
      );
      gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const remainingApprovedMln = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address]),
      );
      const post = await getAllBalances(deployed, accounts, fund);
      offerRemainder = testInstance.offeredValue
        .minus(pre.investor.MlnToken)
        .plus(post.investor.MlnToken);
      t.deepEqual(remainingApprovedMln, 0);
      t.deepEqual(
        investorPostShares,
        investorPreShares.add(testInstance.wantedShares),
      );
      t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
      t.deepEqual(post.worker.EthToken, pre.worker.EthToken);

      t.deepEqual(
        post.investor.MlnToken,
        pre.investor.MlnToken.minus(testInstance.offeredValue).add(
          offerRemainder,
        ),
      );

      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(
        post.fund.MlnToken,
        pre.fund.MlnToken.add(testInstance.offeredValue).minus(offerRemainder),
      );
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial("performs calculation correctly", async t => {
    const [
      preGav,
      preManagementFee,
      prePerformanceFee,
      preUnclaimedFees,
      preFeesShareQuantity,
      preNav,
      preSharePrice,
    ] = fundPreCalculations;
    const [
      postGav,
      postManagementFee,
      postPerformanceFee,
      postUnclaimedFees,
      postFeesShareQuantity,
      postNav,
      postSharePrice,
    ] = Object.values(await fund.instance.performCalculations.call({}, []));

    const [, mlnPrice, mlnDecimals] = await pricefeed.instance.getPriceInfo.call({}, [mlnToken.address]);
    const additionalValueInEther = Math.round(testInstance.offeredValue.minus(offerRemainder).mul(mlnPrice).div(10 ** mlnDecimals));
    t.deepEqual(
      postGav,
      preGav.add(additionalValueInEther),
    );
    const totalShares = await fund.instance.totalSupply.call({}, []);
    const feeDifference = postUnclaimedFees.minus(preUnclaimedFees);
    const expectedFeeShareDifference = Math.floor(
      totalShares * postUnclaimedFees / postGav -
        totalShares * preUnclaimedFees / preGav,
    );
    t.deepEqual(postManagementFee, preManagementFee.add(feeDifference));
    t.deepEqual(postUnclaimedFees, preUnclaimedFees.add(feeDifference));
    t.deepEqual(
      postFeesShareQuantity,
      preFeesShareQuantity.add(expectedFeeShareDifference),
    );
    t.deepEqual(postPerformanceFee, prePerformanceFee);
    t.deepEqual(
      postNav,
      preNav
        .add(additionalValueInEther)
        .minus(feeDifference),
    );
    t.true(Number(postSharePrice) <= Number(preSharePrice));
    fundPreCalculations = [];
  });

  test.serial("management fee calculated correctly", async t => {
    const timestamp = await calcSharePriceAndAllocateFees(
      fund,
      manager,
      config,
    );
    const currentTime = new Date(timestamp).valueOf();
    const calculationsAtLastAllocation = await fund.instance.atLastUnclaimedFeeAllocation.call(
      {},
      [],
    );
    const gav = await fund.instance.calcGav.call({}, []);
    const calculatedFee =
      config.protocol.fund.managementFee /
      10 ** 18 *
      (gav / 31536000 / 1000) *
      (currentTime - atLastUnclaimedFeeAllocation);
    atLastUnclaimedFeeAllocation = currentTime;
    t.is(Number(calculationsAtLastAllocation[1]), Math.round(calculatedFee));
  });
});

// redemption
const testArray = [
  {
    wantedShares: new BigNumber(10 ** 18),
    wantedValue: new BigNumber(0.7 * 10 ** 18),
  },
  {
    wantedShares: new BigNumber(0.2 * 10 ** 18),
    wantedValue: new BigNumber(10 ** 17),
  },
  {
    wantedShares: new BigNumber(0.3 * 10 ** 18).add(2000),
    wantedValue: new BigNumber(10 ** 17),
  },
];

testArray.forEach(testInstance => {
  let fundPreCalculations;
  let additionalValue;
  test.serial("investor can request redemption from fund", async t => {
    fundPreCalculations = Object.values(
      await fund.instance.performCalculations.call(opts, []),
    );
    const pre = await getAllBalances(deployed, accounts, fund);
    txId = await fund.instance.requestRedemption.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [testInstance.wantedShares, testInstance.wantedValue, mlnToken.address],
    );
    const gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(
      post.investor.ether,
      pre.investor.ether.minus(runningGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  });

  // it("logs RequestUpdated event", async () => {
  // const events = await fund.getPastEvents('RequestUpdated');
  // t.deepEqual(events.length, 1);
  // });

  test.serial(
    "executing request moves token from fund to investor, shares annihilated",
    async t => {
      let investorGasTotal = new BigNumber(0);
      await updateCanonicalPriceFeed(deployed);
      await updateCanonicalPriceFeed(deployed);
      const pre = await getAllBalances(deployed, accounts, fund);
      const investorPreShares = await fund.instance.balanceOf.call({}, [
        investor,
      ]);
      const requestId = await fund.instance.getLastRequestId.call({}, []);
      txId = await fund.instance.executeRequest.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [requestId],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      investorGasTotal = runningGasTotal.plus(gasUsed);
      // reduce remaining allowance to zero
      txId = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, 0],
      );
      gasUsed = (await api.eth.getTransactionReceipt(txId)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const remainingApprovedMln = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address]),
      );
      const investorPostShares = await fund.instance.balanceOf.call({}, [
        investor,
      ]);

      const post = await getAllBalances(deployed, accounts, fund);
      additionalValue = post.investor.MlnToken.minus(
        pre.investor.MlnToken,
      ).minus(testInstance.wantedValue);
      t.deepEqual(remainingApprovedMln, 0);
      t.deepEqual(
        investorPostShares,
        investorPreShares.minus(testInstance.wantedShares),
      );
      t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
      t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
      // t.deepEqual(postTotalShares, preTotalShares - testInstance.wantedShares);
      t.deepEqual(
        post.investor.MlnToken,
        pre.investor.MlnToken.add(testInstance.wantedValue).add(
          additionalValue,
        ),
      );
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(
        post.fund.MlnToken,
        pre.fund.MlnToken.minus(testInstance.wantedValue).minus(
          additionalValue,
        ),
      );
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial("calculations are performed correctly", async t => {
    const [
      preGav,
      ,
      ,
      preUnclaimedFees,
      preFeesShareQuantity,
      ,
      preSharePrice,
    ] = fundPreCalculations;
    const [
      postGav,
      ,
      ,
      postUnclaimedFees,
      postFeesShareQuantity,
      ,
      postSharePrice,
    ] = Object.values(await fund.instance.performCalculations.call({}, []));
    const totalShares = await fund.instance.totalSupply.call({}, []);
    let expectedFeeShareDifference = Math.floor(
      totalShares * postUnclaimedFees / postGav -
        totalShares.add(testInstance.wantedShares) * preUnclaimedFees / preGav,
    );

    // Workaround for rounding issue
    const feeShareDifference = postFeesShareQuantity - preFeesShareQuantity;
    if (Math.abs(feeShareDifference - expectedFeeShareDifference) === 1) {
      expectedFeeShareDifference = feeShareDifference;
    }
    if (Number(totalShares) !== 0) {
      t.is(Number(postSharePrice), Number(preSharePrice));
    }
    else {
      t.deepEqual(postSharePrice, new BigNumber(10 ** 18));
    }
    fundPreCalculations = [];
  });
});

test.serial(
  "investor has redeemed all shares, and they have been annihilated",
  async t => {
    const finalInvestorShares = Number(
      await fund.instance.balanceOf.call({}, [investor]),
    );
    // const finalTotalShares = Number(
    //   await fund.instance.totalSupply.call({}, []),
    // );

    t.deepEqual(finalInvestorShares, 0);
    // t.deepEqual(finalTotalShares, 0); (Fee Shares Remain)
  },
);
