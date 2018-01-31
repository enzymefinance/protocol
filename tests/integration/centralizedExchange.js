import test from "ava";
import api from "../../utils/lib/api";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import deployEnvironment from "../../utils/deploy/contracts";
import updatePriceFeed from "../../utils/lib/updatePriceFeed";

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
let worker;
let deployed;

// mock data
const offeredValue = 10 ** 10;
const wantedShares = 10 ** 10;

// helper functions
// TODO: use imported function to get balances
async function getAllBalances() {
  return {
    investor: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [investor])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [investor])),
      ether: new BigNumber(await api.eth.getBalance(investor)),
    },
    manager: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [manager])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [manager])),
      ether: new BigNumber(await api.eth.getBalance(manager)),
    },
    fund: {
      mlnToken: Number(
        await mlnToken.instance.balanceOf.call({}, [fund.address]),
      ),
      ethToken: Number(
        await ethToken.instance.balanceOf.call({}, [fund.address]),
      ),
      ether: new BigNumber(await api.eth.getBalance(fund.address)),
    },
    worker: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [worker])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [worker])),
      ether: new BigNumber(await api.eth.getBalance(worker)),
    },
    deployer: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [deployer])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [deployer])),
      ether: new BigNumber(await api.eth.getBalance(deployer)),
    },
    exchangeOwner: {
      mlnToken: Number(await mlnToken.instance.balanceOf.call({}, [exchangeOwner])),
      ethToken: Number(await ethToken.instance.balanceOf.call({}, [exchangeOwner])),
      ether: new BigNumber(await api.eth.getBalance(exchangeOwner)),
    },
  };
}

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  [deployer, manager, investor, worker, exchangeOwner] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.PriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  centralizedExchange = await deployContract("exchange/thirdparty/CentralizedExchangeInterface",
    {from: deployer, gas: config.gas, gasPrice: config.gasPrice} // TODO: are all these params necessary?
  );
  const hash = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Suisse Fund",
      deployed.MlnToken.address, // base asset
      config.protocol.fund.managementReward,
      config.protocol.fund.performanceReward,
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
  const sellQuantity1 = 1000;
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: Math.round(referencePrice / 10 ** 18 * sellQuantity1),
  };
});

test.serial("transfer ownership of exchange from deployer to new owner", async t => {
  const oldOwner = await centralizedExchange.instance.owner.call({}, []);
  await centralizedExchange.instance.changeOwner.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [exchangeOwner],
  );
  const newOwner = await centralizedExchange.instance.owner.call({}, [],);
  t.is(oldOwner, deployer);
  t.is(newOwner, exchangeOwner);
});

const initialTokenAmount = new BigNumber(10 ** 15);
test.serial("investor receives initial mlnToken for testing", async t => {
  const pre = await getAllBalances();
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  const post = await getAllBalances();

  t.deepEqual(
    post.investor.mlnToken,
    new BigNumber(pre.investor.mlnToken).add(initialTokenAmount).toNumber(),
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

test.serial(
  "fund receives MLN from a subscription (request & execute)",
  async t => {
    await mlnToken.instance.transfer.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [investor, 10 ** 14, ""],
    );
    const pre = await getAllBalances();
    await mlnToken.instance.approve.postTransaction(
      { from: investor, gasPrice: config.gasPrice, gas: config.gas },
      [fund.address, offeredValue],
    );
    await fund.instance.requestSubscription.postTransaction(
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
    const post = await getAllBalances();

    t.deepEqual(post.worker.mlnToken, pre.worker.mlnToken);
    t.deepEqual(post.worker.ethToken, pre.worker.ethToken);
    t.deepEqual(
      post.investor.mlnToken,
      pre.investor.mlnToken - offeredValue,
    );
    t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
    t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
    t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken + offeredValue);
    t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("Manager makes an order through centralized exchange adapter", async t => {
  const pre = await getAllBalances();
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
  
  const post = await getAllBalances();
  const heldinExchange = await fund.instance.quantityHeldInCustodyOfExchange.call({}, [mlnToken.address]);

  t.is(Number(heldinExchange), trade1.sellQuantity);
  t.deepEqual(post.exchangeOwner.mlnToken, pre.exchangeOwner.mlnToken  + trade1.sellQuantity);
  t.deepEqual(post.exchangeOwner.ethToken, pre.exchangeOwner.ethToken);
  t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
  t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
  t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
  t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken - trade1.sellQuantity);
  t.deepEqual(post.fund.ethToken, pre.fund.ethToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial("Manager settles an order on the exchange interface",
  async t => {
    const pre = await getAllBalances();
    const orderId = await centralizedExchange.instance.getLastOrderId.call({}, []);
    await ethToken.instance.approve.postTransaction(
      { from: deployer, gasPrice: config.gasPrice, gas: config.gas },
      [centralizedExchange.address, trade1.buyQuantity],
    );
    await centralizedExchange.instance.settleOrder.postTransaction(
      { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
      [
        orderId,
        trade1.buyQuantity
      ],
    );
    const post = await getAllBalances();
    const heldinExchange = await fund.instance.quantityHeldInCustodyOfExchange.call({}, [mlnToken.address]);

    t.is(Number(heldinExchange), 0);
    t.deepEqual(post.deployer.ethToken, pre.deployer.ethToken - trade1.buyQuantity);
    t.deepEqual(post.fund.ethToken, pre.fund.ethToken + trade1.buyQuantity);
    t.deepEqual(post.exchangeOwner.mlnToken, pre.exchangeOwner.mlnToken);
    t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
    t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
    t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
    t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("Manager cancels an order from the fund",
  async t => {
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
    const pre = await getAllBalances();
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
      [
        0,
        orderId
      ],
    );
    const post = await getAllBalances();
    const heldInExchange = await fund.instance.quantityHeldInCustodyOfExchange.call({}, [mlnToken.address]);

    t.is(Number(heldInExchange), 0);
    t.deepEqual(post.fund.mlnToken, pre.fund.mlnToken + trade1.sellQuantity);
    t.deepEqual(post.exchangeOwner.mlnToken, pre.exchangeOwner.mlnToken - trade1.sellQuantity);
    t.deepEqual(post.investor.mlnToken, pre.investor.mlnToken);
    t.deepEqual(post.investor.ethToken, pre.investor.ethToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.ethToken, pre.manager.ethToken);
    t.deepEqual(post.manager.mlnToken, pre.manager.mlnToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);
