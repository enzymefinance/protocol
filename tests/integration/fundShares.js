import test from "ava";
import Api from "@parity/api";
import getAllBalances from "../../utils/lib/getAllBalances";
import updateDatafeed, * as deployedUtils from "../../utils/lib/utils";

const addressBook = require("../../addressBook.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");
const fs = require("fs");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

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
let receipt;
let runningGasTotal;
let fund;
let worker;
let version;

const addresses = addressBook[environment];

test.before(async () => {
  accounts = await deployedUtils.accounts;
  gasPrice = Number(await api.eth.gasPrice());
  deployer = accounts[0];
  manager = accounts[1];
  investor = accounts[2];
  worker = accounts[3];
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployedUtils.version;
  mlnToken = await deployedUtils.mlnToken;
});

test.beforeEach(() => {
  runningGasTotal = new BigNumber(0);
});

// Setup
// For unique fundName on each test run
const fundName = `Melon Portfolio ${Math.floor(Math.random() * 1000000) + 1}`;
test.serial('can set up new fund', async t => {
  const preManagerEth = new BigNumber(await api.eth.getBalance(manager));
  const hash =
    "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  receipt = await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      fundName, // name
      addresses.MlnToken, // reference asset
      config.protocol.fund.managementReward,
      config.protocol.fund.performanceReward,
      addresses.NoCompliance,
      addresses.RMMakeOrders,
      addresses.PriceFeed,
      [addresses.SimpleMarket],
      [addresses.simpleAdapter],
      v,
      r,
      s
    ]
  );
  // Since postTransaction returns transaction hash instead of object as in Web3
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const fundId = await version.instance.getLastFundId.call({}, []);
  const fundAddress = await version.instance.getFundById.call({}, [fundId]);
  fund = await api.newContract(
    JSON.parse(fs.readFileSync("out/Fund.abi")),
    fundAddress
  );
  const postManagerEth = new BigNumber(await api.eth.getBalance(manager));

  t.deepEqual(postManagerEth, preManagerEth.minus(runningGasTotal.times(gasPrice)));
  t.deepEqual(Number(fundId), 0);
  // t.true(await version.instance.fundNameTaken.call({}, [fundName]));
  // t.deepEqual(postManagerEth, preManagerEth.minus(runningGasTotal.times(gasPrice)));
});

test.serial('initial calculations', async t => {
  await updateDatafeed();
  const [
    gav,
    managementReward,
    performanceReward,
    unclaimedRewards,
    rewardsShareQuantity,
    nav,
    sharePrice
  ] = Object.values(await fund.instance.performCalculations.call(opts, []));

  t.deepEqual(Number(gav), 0);
  t.deepEqual(Number(managementReward), 0);
  t.deepEqual(Number(performanceReward), 0);
  t.deepEqual(Number(unclaimedRewards), 0);
  t.deepEqual(Number(rewardsShareQuantity), 0);
  t.deepEqual(Number(nav), 0);
  t.deepEqual(Number(sharePrice), 10 ** 18);
});
const initialTokenAmount = new BigNumber(10 ** 15);
test.serial('investor receives initial mlnToken for testing', async t => {
  const pre = await getAllBalances(accounts, fund);
  const preDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  receipt = await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""]
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  const post = await getAllBalances(accounts, fund);

  t.deepEqual(
    postDeployerEth.toString(),
    preDeployerEth.minus(runningGasTotal.times(gasPrice)).toString()
  );
  t.deepEqual(
    post.investor.mlnToken,
    new BigNumber(pre.investor.mlnToken).add(initialTokenAmount).toNumber()
  );

  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// subscription
// TODO: reduce code duplication between this and subsequent tests
// split first and subsequent tests due to differing behaviour
const firstTest = {
  wantedShares: 20000,
  offeredValue: 20000,
  incentive: 100
};
const subsequentTests = [
  { wantedShares: 20143783, offeredValue: 30000000, incentive: 5000 },
  { wantedShares: 500, offeredValue: 2000, incentive: 5000 }
];
test.serial('allows request and execution on the first subscription', async t => {
  let investorGasTotal = new BigNumber(0);
  let workerGasTotal = new BigNumber(0);
  const pre = await getAllBalances(accounts, fund);
  receipt = await fund.instance.requestSubscription.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [firstTest.offeredValue, firstTest.wantedShares, firstTest.incentive]
  );
  let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const inputAllowance = firstTest.offeredValue + firstTest.incentive;
  const fundPreAllowance = Number(
    await mlnToken.instance.allowance.call({}, [investor, fund.address])
  );
  receipt = await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice },
    [fund.address, inputAllowance]
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const fundPostAllowance = Number(
    await mlnToken.instance.allowance.call({}, [investor, fund.address])
  );
  const sharePrice = await fund.instance.calcSharePrice.call({}, []);
  const requestedSharesTotalValue = await fund.instance.toWholeShareUnit.call(
    {},
    [firstTest.wantedShares * sharePrice]
  );
  const offerRemainder = firstTest.offeredValue - requestedSharesTotalValue;
  const investorPreShares = Number(
    await fund.instance.balanceOf.call({}, [investor])
  );
  await updateDatafeed();
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  receipt = await fund.instance.executeRequest.postTransaction(
    { from: worker, gas: config.gas, gasPrice: config.gasPrice },
    [requestId]
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  workerGasTotal = workerGasTotal.plus(gasUsed);
  const investorPostShares = Number(
    await fund.instance.balanceOf.call({}, [investor])
  );
  // reduce leftover allowance of investor to zero
  receipt = await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice },
    [fund.address, 0]
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const remainingApprovedMln = Number(
    await mlnToken.instance.allowance.call({}, [investor, fund.address])
  );
  const post = await getAllBalances(accounts, fund);

  t.deepEqual(remainingApprovedMln, 0);
  t.deepEqual(investorPostShares, investorPreShares + firstTest.wantedShares);
  t.deepEqual(fundPostAllowance, fundPreAllowance + inputAllowance);
  t.deepEqual(post.worker.mlnToken, pre.worker.mlnToken + firstTest.incentive);
  t.deepEqual(post.worker.ethToken, pre.worker.ethToken);
  t.deepEqual(
    post.worker.ether,
    pre.worker.ether.minus(workerGasTotal.times(gasPrice))
  );
  t.deepEqual(
    post.investor.mlnToken,
    pre.investor.mlnToken -
      firstTest.incentive -
      firstTest.offeredValue +
      offerRemainder
  );

  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice))
  );
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(
    post.fund.mlnToken,
    pre.fund.mlnToken + firstTest.offeredValue - offerRemainder
  );
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

subsequentTests.forEach((testInstance) => {
    let fundPreCalculations;
    let offerRemainder;

    test.serial('funds approved, and subscribe request issued, but tokens do not change ownership', async t => {
      fundPreCalculations = Object.values(
        await fund.instance.performCalculations.call(opts, [])
      );
      const pre = await getAllBalances(accounts, fund);
      const inputAllowance = testInstance.offeredValue + testInstance.incentive;
      const fundPreAllowance = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address])
      );
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, inputAllowance]
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const fundPostAllowance = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address])
      );

      t.deepEqual(fundPostAllowance, fundPreAllowance + inputAllowance);

      receipt = await fund.instance.requestSubscription.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [testInstance.offeredValue, testInstance.wantedShares, testInstance.incentive]
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const post = await getAllBalances(accounts, fund);

      t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
      t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(runningGasTotal.times(gasPrice))
      );
      t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
      t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
      t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    });

    test.serial('executing subscribe request transfers incentive to worker, shares to investor, and remainder of subscription offer to investor', async t => {
      let investorGasTotal = new BigNumber(0);
      let workerGasTotal = new BigNumber(0);
      await updateDatafeed();
      await updateDatafeed();
      const pre = await getAllBalances(accounts, fund);
      const sharePrice = await fund.instance.calcSharePrice.call({}, []);
      const requestedSharesTotalValue = await fund.instance.toWholeShareUnit.call(
        {},
        [testInstance.wantedShares * sharePrice]
      );
      offerRemainder = testInstance.offeredValue - requestedSharesTotalValue;
      const investorPreShares = Number(
        await fund.instance.balanceOf.call({}, [investor])
      );
      const requestId = await fund.instance.getLastRequestId.call({}, []);
      receipt = await fund.instance.executeRequest.postTransaction(
        { from: worker, gas: config.gas, gasPrice: config.gasPrice },
        [requestId]
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      workerGasTotal = workerGasTotal.plus(gasUsed);
      const investorPostShares = Number(
        await fund.instance.balanceOf.call({}, [investor])
      );
      // reduce leftover allowance of investor to zero
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, 0]
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const remainingApprovedMln = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address])
      );
      const post = await getAllBalances(accounts, fund);

      t.deepEqual(remainingApprovedMln, 0);
      t.is(Number(investorPostShares), investorPreShares + testInstance.wantedShares);
      t.deepEqual(post.worker.mlnToken, pre.worker.mlnToken + testInstance.incentive);
      t.deepEqual(post.worker.ethToken, pre.worker.ethToken);
      t.deepEqual(
        post.worker.ether,
        pre.worker.ether.minus(workerGasTotal.times(gasPrice))
      );
      t.deepEqual(
        post.investor.mlnToken,
        pre.investor.mlnToken -
          testInstance.incentive -
          testInstance.offeredValue +
          offerRemainder
      );

      t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(investorGasTotal.times(gasPrice))
      );
      t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
      t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
      t.deepEqual(
        post.fund.mlnToken,
        pre.fund.mlnToken + testInstance.offeredValue - offerRemainder
      );
      t.deepEqual(post.fund.ether, pre.fund.ether);
    });

    test.serial('performs calculation correctly', async t => {
      const [
        preGav,
        preManagementReward,
        prePerformanceReward,
        preUnclaimedRewards,
        preRewardsShareQuantity,
        preNav,
        preSharePrice
      ] = fundPreCalculations.map(element => Number(element));
      const [
        postGav,
        postManagementReward,
        postPerformanceReward,
        postUnclaimedRewards,
        postRewardsShareQuantity,
        postNav,
        postSharePrice
      ] = Object.values(await fund.instance.performCalculations.call({}, []));

      t.deepEqual(Number(postGav), preGav + testInstance.offeredValue - offerRemainder);
      t.deepEqual(Number(postManagementReward), preManagementReward);
      t.deepEqual(Number(postPerformanceReward), prePerformanceReward);
      t.deepEqual(Number(postUnclaimedRewards), preUnclaimedRewards);
      t.deepEqual(Number(preRewardsShareQuantity), Number(postRewardsShareQuantity));
      t.deepEqual(Number(postNav), preNav + testInstance.offeredValue - offerRemainder);
      t.deepEqual(Number(postSharePrice), preSharePrice);
      fundPreCalculations = [];
    });
});

// redemption
const testArray = [
  { wantedShares: 20000, wantedValue: 20000, incentive: 100 },
  { wantedShares: 500, wantedValue: 500, incentive: 500 },
  { wantedShares: 20143783, wantedValue: 20143783, incentive: 5000 }
];
testArray.forEach((testInstance) => {
  let fundPreCalculations;
    test.serial('investor can request redemption from fund', async t => {
      fundPreCalculations = Object.values(
        await fund.instance.performCalculations.call(opts, [])
      );
      const pre = await getAllBalances(accounts, fund);
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, testInstance.incentive]
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      receipt = await fund.instance.requestRedemption.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [testInstance.wantedShares, testInstance.wantedValue, testInstance.incentive]
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const post = await getAllBalances(accounts, fund);

      t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
      t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(runningGasTotal.times(gasPrice))
      );
      t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
      t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
      t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    });

    // it("logs RequestUpdated event", async () => {
      // const events = await fund.getPastEvents('RequestUpdated');
      // t.deepEqual(events.length, 1);
    // });

    test.serial('executing request moves token from fund to investor, shares annihilated, and incentive to worker', async t => {
      let workerGasTotal = new BigNumber(0);
      let investorGasTotal = new BigNumber(0);
      await updateDatafeed();
      await updateDatafeed();
      const pre = await getAllBalances(accounts, fund);
      const investorPreShares = Number(
        await fund.instance.balanceOf.call({}, [investor])
      );
      const preTotalShares = Number(
        await fund.instance.totalSupply.call({}, [])
      );
      const requestId = await fund.instance.getLastRequestId.call({}, []);
      receipt = await fund.instance.executeRequest.postTransaction(
        { from: worker, gas: config.gas, gasPrice: config.gasPrice },
        [requestId]
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      workerGasTotal = runningGasTotal.plus(gasUsed);
      // reduce remaining allowance to zero
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice },
        [fund.address, 0]
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = runningGasTotal.plus(gasUsed);
      const remainingApprovedMln = Number(
        await mlnToken.instance.allowance.call({}, [investor, fund.address])
      );
      const investorPostShares = Number(
        await fund.instance.balanceOf.call({}, [investor])
      );
      const postTotalShares = Number(
        await fund.instance.totalSupply.call({}, [])
      );
      const post = await getAllBalances(accounts, fund);

      t.deepEqual(remainingApprovedMln, 0);
      t.deepEqual(investorPostShares, investorPreShares - testInstance.wantedShares);
      t.deepEqual(post.worker.mlnToken, pre.worker.mlnToken + testInstance.incentive);
      t.deepEqual(post.worker.ethToken, pre.worker.ethToken);
      t.deepEqual(
        post.worker.ether,
        pre.worker.ether.minus(workerGasTotal.times(gasPrice))
      );
      t.deepEqual(postTotalShares, preTotalShares - testInstance.wantedShares);
      t.deepEqual(
        post.investor.mlnToken,
        pre.investor.mlnToken + testInstance.wantedValue - testInstance.incentive
      );
      t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(investorGasTotal.times(gasPrice))
      );
      t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
      t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken - testInstance.wantedValue);
      t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    });

    test.serial('calculations are performed correctly', async t => {
      const [
        preGav,
        preManagementReward,
        prePerformanceReward,
        preUnclaimedRewards,
        preRewardsShareQuantity,
        preNav,
        preSharePrice
      ] = fundPreCalculations.map(element => Number(element));
      const [
        postGav,
        postManagementReward,
        postPerformanceReward,
        postUnclaimedRewards,
        postRewardsShareQuantity,
        postNav,
        postSharePrice
      ] = Object.values(await fund.instance.performCalculations.call({}, []));

      t.deepEqual(Number(postGav), preGav - testInstance.wantedValue);
      t.deepEqual(Number(postManagementReward), preManagementReward);
      t.deepEqual(Number(postPerformanceReward), prePerformanceReward);
      t.deepEqual(Number(postUnclaimedRewards), preUnclaimedRewards);
      t.deepEqual(Number(preRewardsShareQuantity), Number(postRewardsShareQuantity));
      t.deepEqual(Number(postNav), preNav - testInstance.wantedValue);
      t.deepEqual(Number(postSharePrice), preSharePrice);
      fundPreCalculations = [];
    });
});

test.serial('investor has redeemed all shares, and they have been annihilated', async t => {
  const finalInvestorShares = Number(
    await fund.instance.balanceOf.call({}, [investor])
  );
  const finalTotalShares = Number(await fund.instance.totalSupply.call({}, []));

  t.deepEqual(finalInvestorShares, 0);
  t.deepEqual(finalTotalShares, 0);
});
