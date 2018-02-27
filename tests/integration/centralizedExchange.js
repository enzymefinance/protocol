import test from "ava";
import api from "../../utils/lib/api";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import getSignatureParameters from "../../utils/lib/getSignatureParameters";
import updatePriceFeed from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";

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
let centralizedExchange;
let exchangeOwner;
let trade1;
let version;
let deployed;

// mock data
const offeredValue = new BigNumber(10 ** 10);
const wantedShares = new BigNumber(10 ** 10);

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor, , exchangeOwner] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.PriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  centralizedExchange = await deployContract(
    "exchange/thirdparty/CentralizedExchangeBridge",
    { from: deployer },
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
      [centralizedExchange.address],
      [deployed.CentralizedAdapter.address],
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

  const [, referencePrice] = await pricefeed.instance.getReferencePrice.call(
    {},
    [mlnToken.address, ethToken.address],
  );
  const sellQuantity1 = new BigNumber(10 * 19);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: Math.round(referencePrice / 10 ** 18 * sellQuantity1),
  };
});

test.serial(
  "transfer ownership of exchange from deployer to new owner",
  async t => {
    const oldOwner = await centralizedExchange.instance.owner.call({}, []);
    await centralizedExchange.instance.changeOwner.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [exchangeOwner],
    );
    const newOwner = await centralizedExchange.instance.owner.call({}, []);
    t.is(oldOwner, deployer);
    t.is(newOwner, exchangeOwner);
  },
);

const initialTokenAmount = new BigNumber(10 ** 20);
test.serial("investor receives initial mlnToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.MlnToken,
    new BigNumber(pre.investor.MlnToken).add(initialTokenAmount),
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
  "fund receives MLN from a investment (request & execute)",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await mlnToken.instance.approve.postTransaction(
      { from: investor, gasPrice: config.gasPrice, gas: config.gas },
      [fund.address, offeredValue],
    );
    await fund.instance.requestInvestment.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [offeredValue, wantedShares, false],
    );
    await updatePriceFeed(deployed);
    await updatePriceFeed(deployed);
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
      pre.investor.MlnToken.minus(offeredValue),
    );
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(offeredValue));
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial(
  "Manager makes an order through centralized exchange adapter",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await updatePriceFeed(deployed);
    await fund.instance.makeOrder.postTransaction(
      { from: manager, gas: config.gas, gasPrice: config.gasPrice },
      [
        0,
        mlnToken.address,
        ethToken.address,
        trade1.sellQuantity,
        trade1.buyQuantity,
      ],
    );
    const post = await getAllBalances(deployed, accounts, fund);
    const heldinExchange = await fund.instance.quantityHeldInCustodyOfExchange.call(
      {},
      [mlnToken.address],
    );

    t.deepEqual(heldinExchange, trade1.sellQuantity);
    t.deepEqual(
      post.exchangeOwner.MlnToken,
      pre.exchangeOwner.MlnToken.add(trade1.sellQuantity),
    );
    t.deepEqual(post.exchangeOwner.EthToken, pre.exchangeOwner.EthToken);
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(
      post.fund.MlnToken,
      pre.fund.MlnToken.minus(trade1.sellQuantity),
    );
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("Manager settles an order on the exchange interface", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const orderId = await centralizedExchange.instance.getLastOrderId.call(
    {},
    [],
  );
  await ethToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice, gas: config.gas },
    [centralizedExchange.address, trade1.buyQuantity],
  );
  await centralizedExchange.instance.settleOrder.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [orderId, trade1.buyQuantity],
  );
  const post = await getAllBalances(deployed, accounts, fund);
  const heldinExchange = await fund.instance.quantityHeldInCustodyOfExchange.call(
    {},
    [mlnToken.address],
  );

  t.is(Number(heldinExchange), 0);
  t.deepEqual(
    post.deployer.EthToken,
    pre.deployer.EthToken.minus(trade1.buyQuantity),
  );
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(trade1.buyQuantity));
  t.deepEqual(post.exchangeOwner.MlnToken, pre.exchangeOwner.MlnToken);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("Manager cancels an order from the fund", async t => {
  await updatePriceFeed(deployed);
  await fund.instance.makeOrder.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      0,
      mlnToken.address,
      ethToken.address,
      trade1.sellQuantity,
      trade1.buyQuantity,
    ],
  );
  const pre = await getAllBalances(deployed, accounts, fund);
  const orderId = await fund.instance.getLastOrderId.call({}, []);
  await mlnToken.instance.transfer.postTransaction(
    { from: exchangeOwner, gasPrice: config.gasPrice, gas: config.gas },
    [manager, trade1.sellQuantity, ""],
  );
  await mlnToken.instance.approve.postTransaction(
    { from: manager, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, trade1.sellQuantity],
  );
  await mlnToken.instance.approve.postTransaction(
    { from: manager, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, trade1.sellQuantity],
  );
  await fund.instance.cancelOrder.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [0, orderId],
  );
  const post = await getAllBalances(deployed, accounts, fund);
  const heldInExchange = await fund.instance.quantityHeldInCustodyOfExchange.call(
    {},
    [mlnToken.address],
  );

  t.is(Number(heldInExchange), 0);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(trade1.sellQuantity));
  t.deepEqual(
    post.exchangeOwner.MlnToken,
    pre.exchangeOwner.MlnToken.minus(trade1.sellQuantity),
  );
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
