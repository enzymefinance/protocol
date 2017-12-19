import test from "ava";
import Api from "@parity/api";
import updateDatafeed, * as deployedUtils from "../../utils/lib/utils";

const addressBook = require("../../addressBook.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");
const fs = require('fs');

const environment = "development";
const addresses = addressBook[environment];
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let accounts;
let deployer;
let ethToken;
let fund;
let gasPrice;
let investor;
let manager;
let mlnToken;
let pricefeed;
let receipt;
let runningGasTotal;
let simpleMarket;
let trade1;
let trade2;
let trade3;
let trade4;
let version;
let worker;

// mock data
const incentive = 500;
const offeredValue = 10 ** 10;
const wantedShares = 10 ** 10;

// helper functions
async function getAllBalances() {
  return {
    investor: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [investor])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [investor])),
      ether: new BigNumber(await api.eth.getBalance(investor))
    },
    manager: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [manager])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [manager])),
      ether: new BigNumber(await api.eth.getBalance(manager))
    },
    fund: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [fund.address])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [fund.address])),
      ether: new BigNumber(await api.eth.getBalance(fund.address))
    },
    worker: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [worker])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [worker])),
      ether: new BigNumber(await api.eth.getBalance(worker))
    },
    deployer: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [deployer])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [deployer])),
      ether: new BigNumber(await api.eth.getBalance(deployer))
    }
  };
}

test.before(async () => {
  accounts = await deployedUtils.accounts;
  gasPrice = Number(await api.eth.gasPrice());
  deployer = accounts[0];
  manager = accounts[1];
  investor = accounts[2];
  worker = accounts[3];
  version = await deployedUtils.version;
  pricefeed = await deployedUtils.datafeed;
  mlnToken = await deployedUtils.mlnToken;
  ethToken = await deployedUtils.ethToken;
  simpleMarket = await deployedUtils.simpleMarket;
  const hash =
    "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Test fund",          // name
      addresses.MlnToken,   // reference asset
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
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  const fundAbi = JSON.parse(fs.readFileSync("out/Fund.abi"));
  fund = await api.newContract(fundAbi, fundAddress);
});

test.beforeEach(async () => {
  runningGasTotal = new BigNumber(0);

  await updateDatafeed();

  const [, referencePrice] = await pricefeed.instance.getReferencePrice.call(
    {},
    [mlnToken.address, ethToken.address]
  );
  const [
    ,
    invertedReferencePrice
  ] = await pricefeed.instance.getReferencePrice.call({}, [
    ethToken.address,
    mlnToken.address
  ]);
  const sellQuantity1 = 1000;
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: Math.round(referencePrice / 10 ** 18 * sellQuantity1)
  };
  const sellQuantity2 = 50;
  trade2 = {
    sellQuantity: sellQuantity2,
    buyQuantity: Math.round(referencePrice / 10 ** 18 * sellQuantity2)
  };
  const sellQuantity3 = 5;
  trade3 = {
    sellQuantity: sellQuantity3,
    buyQuantity: Math.round(
      invertedReferencePrice / 10 ** 18 * sellQuantity3 / 10
    )
  };
  const sellQuantity4 = 5;
  trade4 = {
    sellQuantity: sellQuantity4,
    buyQuantity: Math.round(
      invertedReferencePrice / 10 ** 18 * sellQuantity4 * 1000
    )
  };
});

const initialTokenAmount = new BigNumber(10 ** 15);
test.serial('investor receives initial mlnToken for testing', async t => {
  const pre = await getAllBalances();
  const preDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  receipt = await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""]
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  const post = await getAllBalances();

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

test.serial('fund receives MLN from a subscription (request & execute)', async t => {
  let investorGasTotal = new BigNumber(0);
  let workerGasTotal = new BigNumber(0);
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, 10 ** 14, ""]
  );
  const pre = await getAllBalances();
  receipt = await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, incentive + offeredValue]
  );
  let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  receipt = await fund.instance.requestSubscription.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [offeredValue, wantedShares, incentive]
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updateDatafeed();
  await updateDatafeed();
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  receipt = await fund.instance.executeRequest.postTransaction(
    { from: worker, gas: config.gas, gasPrice: config.gasPrice },
    [ requestId ]
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  workerGasTotal = workerGasTotal.plus(gasUsed);
  const post = await getAllBalances();

  t.deepEqual(post.worker.mlnToken, pre.worker.mlnToken + incentive);
  t.deepEqual(post.worker.ethToken, pre.worker.ethToken);
  t.deepEqual(
    post.worker.ether,
    pre.worker.ether.minus(workerGasTotal.times(gasPrice))
  );
  t.deepEqual(
    post.investor.mlnToken,
    pre.investor.mlnToken - offeredValue - incentive
  );
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice))
  );
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken + offeredValue);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial('manager makes order, and sellToken (MLN-T) is transferred to exchange', async t => {
  const pre = await getAllBalances();
  const exchangePreMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePreEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  await updateDatafeed();
  receipt = await fund.instance.makeOrder.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      0,
      mlnToken.address,
      ethToken.address,
      trade1.sellQuantity,
      trade1.buyQuantity
    ]
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePostEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const post = await getAllBalances();

  t.deepEqual(exchangePostMln, exchangePreMln + trade1.sellQuantity);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken);
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken - trade1.sellQuantity);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial('third party takes entire order, allowing fund to receive ethToken', async t => {
  const pre = await getAllBalances();
  const orderId = await simpleMarket.instance.last_offer_id.call({}, []);
  const exchangePreMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePreEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  receipt = await ethToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [simpleMarket.address, trade1.buyQuantity + 100]
  );
  let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  receipt = await simpleMarket.instance.buy.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [orderId, trade1.sellQuantity]
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePostEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const post = await getAllBalances();

  t.deepEqual(exchangePostMln, exchangePreMln - trade1.sellQuantity);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken);
  t.deepEqual(
    post.deployer.ether,
    pre.deployer.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.deployer.mlnToken, pre.deployer.mlnToken + trade1.sellQuantity);
  t.deepEqual(post.deployer.ethToken, pre.deployer.ethToken - trade1.buyQuantity);
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken + trade1.buyQuantity);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial('third party makes order (sell MLN-T for ETH-T), and MLN-T is transferred to exchange', async t => {
  const pre = await getAllBalances();
  const exchangePreMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePreEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  receipt = await mlnToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [simpleMarket.address, trade2.sellQuantity]
  );
  let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  receipt = await simpleMarket.instance.offer.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [
      trade2.sellQuantity,
      mlnToken.address,
      trade2.buyQuantity,
      ethToken.address
    ]
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePostEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const post = await getAllBalances();

  t.deepEqual(exchangePostMln, exchangePreMln + trade2.sellQuantity);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken);
  t.deepEqual(post.deployer.mlnToken, pre.deployer.mlnToken);
  t.deepEqual(post.deployer.ethToken, pre.deployer.ethToken - trade2.sellQuantity);
  t.deepEqual(
    post.deployer.ether,
    pre.deployer.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial('manager takes order (buys MLN-T for ETH-T)', async t => {
  const pre = await getAllBalances();
  const exchangePreMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePreEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const orderId = await simpleMarket.instance.last_offer_id.call({}, []);
  receipt = await fund.instance.takeOrder.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [0, orderId, trade2.sellQuantity]
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePostEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const post = await getAllBalances();

  t.deepEqual(exchangePostMln, exchangePreMln - trade2.sellQuantity);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken);
  t.deepEqual(post.deployer.mlnToken, pre.deployer.mlnToken);
  t.deepEqual(post.deployer.ethToken, pre.deployer.ethToken + trade2.buyQuantity);
  t.deepEqual(post.deployer.ether, pre.deployer.ether);
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken + trade2.sellQuantity);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken - trade2.buyQuantity);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial('manager tries to make a bad order (sell ETH-T for MLN-T), RMMakeOrders should prevent this', async t => {
  const pre = await getAllBalances();
  const exchangePreEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const preOrderId = await simpleMarket.instance.last_offer_id.call({}, []);
  receipt = await fund.instance.makeOrder.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      0,
      ethToken.address,
      mlnToken.address,
      trade3.sellQuantity,
      trade3.buyQuantity
    ]
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const post = await getAllBalances();
  const postOrderId = await simpleMarket.instance.last_offer_id.call({}, []);

  t.deepEqual(preOrderId, postOrderId);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
});

test.serial('third party makes order (sell ETH-T for MLN-T) for a bad price, and MLN-T is transferred to exchange', async t => {
  const pre = await getAllBalances();
  const exchangePreMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePreEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  receipt = await ethToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [simpleMarket.address, trade4.sellQuantity]
  );
  let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  receipt = await simpleMarket.instance.offer.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [
      trade4.sellQuantity,
      ethToken.address,
      trade4.buyQuantity,
      mlnToken.address
    ]
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePostEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const post = await getAllBalances();

  t.deepEqual(exchangePostMln, exchangePreMln);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken + trade4.sellQuantity);
  t.deepEqual(post.deployer.mlnToken, pre.deployer.mlnToken);
  t.deepEqual(post.deployer.ethToken, pre.deployer.ethToken - trade4.sellQuantity);
  t.deepEqual(
    post.deployer.ether,
    pre.deployer.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial('manager tried to take a bad order (buys ETH-T for MLN-T), RMMakeOrders should prevent it', async t => {
  const pre = await getAllBalances();
  const exchangePreMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePreEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const orderId = await simpleMarket.instance.last_offer_id.call({}, []);
  receipt = await fund.instance.takeOrder.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [0, orderId, trade4.sellQuantity]
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const exchangePostMln = Number(
    await mlnToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const exchangePostEthToken = Number(
    await ethToken.instance.balanceOf.call({}, [simpleMarket.address])
  );
  const post = await getAllBalances();

  t.deepEqual(exchangePostMln, exchangePreMln);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken);
  t.deepEqual(post.deployer.mlnToken, pre.deployer.mlnToken);
  t.deepEqual(post.deployer.ethToken, pre.deployer.ethToken);
  t.deepEqual(post.deployer.ether, pre.deployer.ether);
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// describe("Redeeming after trading", async () => {
const redemptions = [
  { amount: new BigNumber(100000000), incentive: 500 },
  { amount: new BigNumber(150000000), incentive: 500 }
];
redemptions.forEach((redemption, index) => {
  test.serial(`allows redemption ${index + 1}`, async t => {
    let investorGasTotal = new BigNumber(0);
    let workerGasTotal = new BigNumber(0);
    const investorPreShares = Number(
      await fund.instance.balanceOf.call({}, [investor])
    );
    const preTotalShares = Number(await fund.instance.totalSupply.call({}, []));
    const sharePrice = await fund.instance.calcSharePrice.call({}, []);
    const wantedValue = Number(
      redemption.amount
        .times(sharePrice)
        .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
        .floor()
    );
    const pre = await getAllBalances();
    receipt = await mlnToken.instance.approve.postTransaction(
      { from: investor, gasPrice: config.gasPrice },
      [fund.address, incentive]
    );
    let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    receipt = await fund.instance.requestRedemption.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [redemption.amount, wantedValue, incentive]
    );
    gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    await updateDatafeed();
    await updateDatafeed();
    const requestId = await fund.instance.getLastRequestId.call({}, []);
    receipt = await fund.instance.executeRequest.postTransaction(
      { from: worker, gas: config.gas, gasPrice: config.gasPrice },
      [requestId]
    );
    gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    workerGasTotal = workerGasTotal.plus(gasUsed);
    // reduce remaining allowance to zero
    receipt = await mlnToken.instance.approve.postTransaction(
      { from: investor, gasPrice: config.gasPrice },
      [fund.address, 0]
    );
    gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    const remainingApprovedMln = Number(
      await mlnToken.instance.allowance.call({}, [investor, fund.address])
    );
    const investorPostShares = Number(
      await fund.instance.balanceOf.call({}, [investor])
    );
    const postTotalShares = Number(
      await fund.instance.totalSupply.call({}, [])
    );
    const post = await getAllBalances();

    t.deepEqual(remainingApprovedMln, 0);
    t.deepEqual(postTotalShares, preTotalShares - redemption.amount);
    t.deepEqual(investorPostShares, investorPreShares - redemption.amount);
    t.deepEqual(post.worker.mlnToken, pre.worker.mlnToken + incentive);
    t.deepEqual(post.worker.ethToken, pre.worker.ethToken);
    t.deepEqual(
      post.worker.ether,
      pre.worker.ether.minus(workerGasTotal.times(gasPrice))
    );
    t.deepEqual(
      post.investor.mlnToken,
      pre.investor.mlnToken + wantedValue - incentive
    );
    t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
    t.deepEqual(
      post.investor.ether,
      pre.investor.ether.minus(investorGasTotal.times(gasPrice))
    );
    t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
    t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken - wantedValue);
    t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  });
});

// describe("Rewards", async () => {
test.serial('converts rewards and manager receives them', async t => {
  await updateDatafeed();
  const pre = await getAllBalances();
  const preManagerShares = Number(
    await fund.instance.balanceOf.call({}, [manager])
  );
  const totalSupply = Number(await fund.instance.totalSupply.call({}, []));
  const [gav, , , unclaimedRewards, ,] = Object.values(
    await fund.instance.performCalculations.call({}, [])
  );
  const shareQuantity = Math.floor(totalSupply * unclaimedRewards / gav);
  receipt = await fund.instance.allocateUnclaimedRewards.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    []
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postManagerShares = Number(
    await fund.instance.balanceOf.call({}, [manager])
  );
  const post = await getAllBalances();

  t.deepEqual(postManagerShares, preManagerShares + shareQuantity);
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// shutdown fund
test.serial('manager can shut down a fund', async t => {
  const pre = await getAllBalances();
  receipt = await version.instance.shutDownFund.postTransaction(
    { from: manager, gasPrice: config.gasPrice },
    [fund.address]
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  const isShutDown = await fund.instance.isShutDown.call({}, []);
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const post = await getAllBalances();

  t.true(isShutDown);
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice))
  );
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
