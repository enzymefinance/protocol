/* eslint-disable */
import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import getSignatureParameters from "../../utils/lib/getSignatureParameters";
import updatePriceFeed from "../../utils/lib/updatePriceFeed";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let ethToken;
let fund;
let investor;
let manager;
let mlnToken;
let pricefeed;
let simpleMarketWithApprove;
let simpleAdapterWithApprove;
let trade1;
let version;
let deployed;

// mock data
const offeredValue = 10 ** 10;
const wantedShares = 10 ** 10;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor, , ] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.PriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  simpleMarketWithApprove = await deployContract(
    "exchange/thirdparty/SimpleMarketWithApprove",
    {from: deployer}
  );
  simpleAdapterWithApprove = await deployContract(
    "exchange/adapter/SimpleAdapterWithApprove",
    {from: deployer}
  );
  const [r, s, v] = await getSignatureParameters(manager);
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Suisse Fund",
      deployed.MlnToken.address, // base asset
      config.protocol.fund.managementFee,
      config.protocol.fund.performanceFee,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      deployed.PriceFeed.address,
      [simpleMarketWithApprove.address],
      [simpleAdapterWithApprove.address],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
});

test.beforeEach(async () => {

  await updatePriceFeed(deployed);

});


const initialTokenAmount = new BigNumber(10 ** 15);
test.serial("investor receives initial mlnToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.MlnToken,
    new BigNumber(pre.investor.MlnToken).add(initialTokenAmount).toNumber(),
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

test.serial(
  "fund receives MLN from a subscription (request & execute)",
  async t => {
    await mlnToken.instance.transfer.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [investor, 10 ** 14, ""],
    );
    const pre = await getAllBalances(deployed, accounts, fund);
    await mlnToken.instance.approve.postTransaction(
      { from: investor, gasPrice: config.gasPrice, gas: config.gas },
      [fund.address, offeredValue],
    );
    await fund.instance.requestSubscription.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [offeredValue, wantedShares, false],
    );
    const requestId = await fund.instance.getLastRequestId.call({}, []);
    await fund.instance.executeRequest.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [requestId],
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
    t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
    t.deepEqual(
      post.investor.MlnToken,
      pre.investor.MlnToken - offeredValue,
    );
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken + offeredValue);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("Investor cannot transfer his shares directly to an exchange", async t => {
  const preShares = await fund.instance.balanceOf.call(
    {},
    [investor],
  );
  await fund.instance.transfer.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [simpleMarketWithApprove.address, 10 ** 5, ""],
  );
  const postShares = await fund.instance.balanceOf.call(
    {},
    [investor],
  );
  t.deepEqual(preShares, postShares);
});

test.serial("Investor cannot give allowance to his shares", async t => {
  await fund.instance.approve.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [simpleMarketWithApprove.address, 10 ** 5],
  );
  const allowance = await fund.instance.allowance.call(
    {},
    [simpleAdapterWithApprove.address, investor],
  );
  t.is(allowance.toNumber(), 0);
});
