/* eslint no-underscore-dangle: ["error", { "allow": ["_pollTransactionReceipt"] }] */
import test from "ava";
import web3 from "../../utils/lib/web3";
import { retrieveContract } from "../../utils/lib/contracts";
import deployEnvironment from "../../utils/deploy/contracts";
import calcSharePriceAndAllocateFees from "../../utils/lib/calcSharePriceAndAllocateFees";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateTestingPriceFeed } from "../../utils/lib/updatePriceFeed";

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
let mlnToken;
let ethToken;
let runningGasTotal;
let fund;
let version;
let pricefeed;
let deployed;
let atLastUnclaimedFeeAllocation;
let receipt;
let opts;

async function getFundComponents(hubAddress) {
  let components = {};
  components.hub = await retrieveContract("fund/hub/Hub", hubAddress);
  const participationAddress = await components.hub.methods.participation().call();
  const sharesAddress = await components.hub.methods.shares().call();
  const tradingAddress = await components.hub.methods.trading().call();
  const policyManagerAddress = await components.hub.methods.policyManager().call();
  components.participation = await retrieveContract("fund/participation/Participation", participationAddress);
  components.shares = await retrieveContract("fund/shares/Shares", sharesAddress);
  components.trading = await retrieveContract("fund/trading/Trading", tradingAddress);
  components.policyManager = await retrieveContract("fund/policies/PolicyManager", policyManagerAddress);
  console.log(`Hub: ${hubAddress}`);
  console.log(`Participation: ${participationAddress}`);
  console.log(`Trading: ${tradingAddress}`);
  console.log(`Shares: ${sharesAddress}`);
  console.log(`PolicyManager: ${policyManagerAddress}`);
  const routes = await components.hub.methods.settings().call();
  console.log(`Accounting: ${routes.accounting}`);
  components = Object.assign(components, {
    accounting: await retrieveContract("fund/accounting/Accounting", routes.accounting),
    feeManager: await retrieveContract("fund/fees/FeeManager", routes.feeManager),
    participation: await retrieveContract("fund/participation/Participation", routes.participation),
    policyManager: await retrieveContract("fund/policies/PolicyManager", routes.policyManager),
    shares: await retrieveContract("fund/shares/Shares", routes.shares),
    trading: await retrieveContract("fund/trading/Trading", routes.trading),
    vault: await retrieveContract("fund/vault/Vault", routes.vault),
  });
  return components;
}

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  version = deployed.Version;
  pricefeed = await deployed.TestingPriceFeed;
  mlnToken = deployed.MlnToken;
  ethToken = deployed.EthToken;
  gasPrice = config.gasPrice;
  opts = {
    from: manager,
    gas: 8000000,
    gasPrice: config.gasPrice
  };
  console.log(`Investor: ${investor}`);
  console.log(`Manager: ${manager}`);
  console.log(`Pricefeed: ${pricefeed.options.address}`);
});

test.beforeEach(() => {
  runningGasTotal = new BigNumber(0);
});

// Setup
// For unique fundName on each test run
const fundName = web3.utils.asciiToHex("MelonPortfolio");
test.serial("can set up new fund", async t => {
  const preManagerEth = new BigNumber(await web3.eth.getBalance(manager));
  const [r, s, v] = await getTermsSignatureParameters(manager);
  receipt = await deployed.FundFactory.methods.createComponents(
    [deployed.MatchingMarket.options.address], [deployed.MatchingMarketAdapter.options.address], [deployed.MlnToken.options.address, deployed.EthToken.options.address], [false], deployed.TestingPriceFeed.options.address
  ).send(opts);
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  receipt = await deployed.FundFactory.methods.continueCreation().send(opts);
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  receipt = await deployed.FundFactory.methods.setupFund().send(opts);
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  const fundId = await deployed.FundFactory.methods.getLastFundId().call();
  const hubAddress = await deployed.FundFactory.methods.getFundById(fundId).call();
  fund = await getFundComponents(hubAddress);

  const timestamp = (await web3.eth.getBlock(receipt.blockNumber)).timestamp;
  atLastUnclaimedFeeAllocation = new Date(timestamp).valueOf();
  const postManagerEth = new BigNumber(await web3.eth.getBalance(manager));

  t.deepEqual(
    postManagerEth,
    preManagerEth.minus(runningGasTotal.times(config.gasPrice)),
  );
  t.deepEqual(Number(fundId), 0);
});

test.serial("initial calculations", async t => {
  await updateTestingPriceFeed(deployed);
  const [
    gav,
    unclaimedFees,
    feesShareQuantity,
    nav,
    sharePrice,
  ] = Object.values(await fund.accounting.methods.performCalculations().call());

  t.deepEqual(Number(gav), 0);
  t.deepEqual(Number(unclaimedFees), 0);
  t.deepEqual(Number(feesShareQuantity), 0);
  t.deepEqual(Number(nav), 0);
  t.deepEqual(Number(sharePrice), 10 ** 18);
});

const initialTokenAmount = new BigNumber(10 ** 23);
test.serial("investor receives initial mlnToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const preDeployerEth = new BigNumber(await web3.eth.getBalance(deployer)); // TODO: this is now in getAllBalances
  receipt = await mlnToken.methods.transfer(
    investor, initialTokenAmount
  ).send({ from: deployer, gasPrice: config.gasPrice });
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  const postDeployerEth = new BigNumber(await web3.eth.getBalance(deployer));
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
test.skip.serial(
  "a new fund with a name used before cannot be created",
  async t => {
    const [r, s, v] = await getTermsSignatureParameters(deployer);
    const preFundId = await version.methods.getLastFundId().call();

    await t.throws(version.methods.setupFund(
        fundName, // same name as before
        mlnToken.options.address, // base asset
        config.protocol.fund.managementFee,
        config.protocol.fund.performanceFee,
        deployed.NoCompliance.options.address,
        deployed.RMMakeOrders.options.address,
        [deployed.MatchingMarket.options.address],
        [],
        v,
        r,
        s,
      ).send({from: deployer, gas: config.gas, gasPrice}));

    const newFundAddress = await version.methods.getFundByManager(deployer).call();
    const postFundId = await version.methods.getLastFundId().call();

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
  const price = await pricefeed.methods.getPrice(deployed.MlnToken.options.address).call();
  console.log(`Price of asset: ${price}`);
  const mlnBaseUnitsPerEth = new BigNumber(invertedPrice).times(10**assetDecimals);
  const sharePrice = new BigNumber(await fund.accounting.methods.calcSharePriceAndAllocateFees().call());
  const sharesWorth = new BigNumber(sharePrice.mul(wantedShares) / 10**18);
  return new BigNumber(Math.floor(sharesWorth.mul(mlnBaseUnitsPerEth).div(10 ** assetDecimals)));
}

test.serial("allows request and execution on the first investment", async t => {
  let investorGasTotal = new BigNumber(0);
  const pre = await getAllBalances(deployed, accounts, fund);
  const fundPreAllowance = new BigNumber(await deployed.MlnToken.methods.allowance(investor, fund.participation.options.address).call());
  const offerValue = await calculateOfferValue(firstTest.wantedShares);
  console.log(`Offer value: ${offerValue}`);
  // Offer additional value than market price to avoid price fluctation failures
  firstTest.offeredValue = new BigNumber(Math.floor(offerValue.mul(101)));
  console.log(firstTest)
  console.log(`MlnToken: ${deployed.MlnToken.options.address}`)
  receipt = await deployed.MlnToken.methods.approve(
    fund.participation.options.address, firstTest.offeredValue
  ).send({ from: investor, gasPrice: config.gasPrice });
  investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
  const fundPostAllowance = new BigNumber(await deployed.MlnToken.methods.allowance(investor, fund.participation.options.address).call());
  receipt = await fund.participation.methods.requestInvestment(
    firstTest.offeredValue, firstTest.wantedShares, deployed.MlnToken.options.address
  ).send({ from: investor, gas: config.gas, gasPrice: config.gasPrice });

  investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
  const investorPreShares = new BigNumber(await fund.shares.methods.balanceOf(investor).call());
  await updateTestingPriceFeed(deployed);
  await updateTestingPriceFeed(deployed);
  const requestedSharesTotalValue = await calculateOfferValue(firstTest.wantedShares);
  const offerRemainder = firstTest.offeredValue.minus(requestedSharesTotalValue);
  receipt = await fund.participation.methods.executeRequest().send({ from: investor, gas: config.gas, gasPrice: config.gasPrice });
  console.log(receipt)
  investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
  const investorPostShares = new BigNumber(await fund.shares.methods.balanceOf(investor).call());
  // reduce leftover allowance of investor to zero
  receipt = await deployed.MlnToken.methods.approve(
    fund.participation.options.address, 0
  ).send({from: investor, gasPrice: config.gasPrice});
  investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
  const remainingApprovedMln = Number(
    await mlnToken.methods.allowance(investor, fund.participation.options.address).call(),
  );
  const post = await getAllBalances(deployed, accounts, fund);
  t.deepEqual(remainingApprovedMln, 0);
  t.deepEqual(
    investorPostShares,
    investorPreShares.add(firstTest.wantedShares),
  );
  t.deepEqual(fundPostAllowance, fundPreAllowance.add(firstTest.offeredValue));
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
        await fund.methods.performCalculations().call(),
      );
      const pre = await getAllBalances(deployed, accounts, fund);
      const offerValue = await calculateOfferValue(testInstance.wantedShares);
      // Offer additional value than market price to avoid price fluctation failures
      /* eslint-disable no-param-reassign */
      testInstance.offeredValue = new BigNumber(Math.floor(offerValue.mul(1.1)));
      const inputAllowance = testInstance.offeredValue;
      const fundPreAllowance = new BigNumber(await mlnToken.methods.allowance(investor, fund.options.address).call());
      receipt = await deployed.MlnToken.methods.approve(
        fund.options.address, inputAllowance
      ).send({from: investor, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      const fundPostAllowance = new BigNumber(await mlnToken.methods.allowance(investor, fund.options.address).call());

      t.deepEqual(fundPostAllowance, fundPreAllowance.add(inputAllowance));

      receipt = await fund.methods.requestInvestment(
        testInstance.offeredValue,
        testInstance.wantedShares,
        mlnToken.options.address
      ).send({from: investor, gas: config.gas, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
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
      await updateTestingPriceFeed(deployed);
      await updateTestingPriceFeed(deployed);
      const pre = await getAllBalances(deployed, accounts, fund);
      const investorPreShares = new BigNumber(await fund.methods.balanceOf(investor).call());
      const requestId = await fund.methods.getLastRequestId().call();
      receipt = await fund.methods.executeRequest(
        requestId
      ).send({from: investor, gas: config.gas, gasPrice: config.gasPrice});
      const timestamp = (await web3.eth.getBlock(receipt.blockNumber))
        .timestamp;
      atLastUnclaimedFeeAllocation = new Date(timestamp).valueOf();
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
      const investorPostShares = new BigNumber(await fund.methods.balanceOf(investor).call());
      // reduce leftover allowance of investor to zero
      receipt = await mlnToken.methods.approve(
        fund.options.address, 0
      ).send({from: investor, gasPrice: config.gasPrice});
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
      const remainingApprovedMln = Number(
        await mlnToken.methods.allowance(investor, fund.options.address).call(),
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
    ] = fundPreCalculations.map(e => new BigNumber(e));
    const [
      postGav,
      postManagementFee,
      postPerformanceFee,
      postUnclaimedFees,
      postFeesShareQuantity,
      postNav,
      postSharePrice,
    ] = Object.values(await fund.methods.performCalculations().call()).map(e => new BigNumber(e));

    const [, mlnPrice, mlnDecimals] =
      Object.values(await pricefeed.methods.getPriceInfo(mlnToken.options.address).call()).map(e => new BigNumber(e));
    const additionalValueInEther = Math.floor(testInstance.offeredValue.minus(offerRemainder).mul(mlnPrice).div(10 ** mlnDecimals));

    t.deepEqual(
      postGav,
      preGav.add(additionalValueInEther),
    );

    const totalShares = await fund.methods.totalSupply().call();
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
    const calculationsAtLastAllocation = await fund.methods.atLastUnclaimedFeeAllocation().call();
    const gav = await fund.methods.calcGav().call();
    const calculatedFee =
      config.protocol.fund.managementFee /
      10 ** 18 *
      (gav / 31536000 / 1000) *
      (currentTime - atLastUnclaimedFeeAllocation);
    atLastUnclaimedFeeAllocation = currentTime;
    t.is(Number(calculationsAtLastAllocation[1]), Math.floor(calculatedFee));
  });
});

// redemption
const testArray = [
  new BigNumber(10 ** 18),
  new BigNumber(0.2 * 10 ** 18),
  new BigNumber(0.3 * 10 ** 18).add(2000),
];

testArray.forEach(shares => {
  test.serial("investor can request redemption from fund", async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const investorPreShares = new BigNumber(await fund.methods.balanceOf(investor).call());
    // const ownedAssets = await fund.methods.ownedAssets().call();
    const totalSupply = await fund.methods.totalSupply().call();
    receipt = await fund.methods.redeemAllOwnedAssets(
      shares
    ).send({from: investor, gas: config.gas, gasPrice: config.gasPrice});
    runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
    const post = await getAllBalances(deployed, accounts, fund);
    const investorPostShares = new BigNumber(await fund.methods.balanceOf(investor).call());
    const mlnInCustody =
      await fund.methods.quantityHeldInCustodyOfExchange(deployed.MlnToken.options.address).call();
    const expectedMlnRedemption = new BigNumber(pre.fund.MlnToken).add(mlnInCustody).mul(shares).dividedToIntegerBy(totalSupply);

    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken.add(expectedMlnRedemption));
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(
      investorPostShares,
      investorPreShares.minus(shares),
    );
    t.deepEqual(
      post.investor.ether,
      pre.investor.ether.minus(runningGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.minus(expectedMlnRedemption));
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  });

  // it("logs RequestUpdated event", async () => {
  // const events = await fund.getPastEvents('RequestUpdated');
  // t.deepEqual(events.length, 1);
  // });

});

test.serial(
  "investor has redeemed all shares, and they have been annihilated",
  async t => {
    const finalInvestorShares = Number(
      await fund.methods.balanceOf(investor).call(),
    );
    // const finalTotalShares = Number(
    //   await fund.methods.totalSupply().call(),
    // );

    t.deepEqual(finalInvestorShares, 0);
    // t.deepEqual(finalTotalShares, 0); (Fee Shares Remain)
  },
);
