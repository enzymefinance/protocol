import test from "ava";
import api from "../../utils/lib/api";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
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
let gasPrice;
let investor;
let manager;
let mlnToken;
let pricefeed;
let receipt;
let runningGasTotal;
let SimpleMarket1;
let SimpleMarket2;
let exchanges;
let trade1;
let trade2;
let trade3;
let trade4;
let version;
let deployed;

// mock data
const offeredValue = 10 ** 10;
const wantedShares = 10 ** 10;
const numberofExchanges = 2;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  gasPrice = Number(await api.eth.gasPrice());
  [deployer, manager, investor] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.PriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  SimpleMarket1 = await deployed.SimpleMarket;
  SimpleMarket2 = await deployContract("exchange/thirdparty/SimpleMarket",
    {from: manager, gas: config.gas, gasPrice: config.gasPrice} // TODO: remove unnecessary params
  );
  exchanges = [SimpleMarket1, SimpleMarket2];
  const hash = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Test fund", // name
      deployed.MlnToken.address, // reference asset
      config.protocol.fund.managementReward,
      config.protocol.fund.performanceReward,
      deployed.NoCompliance.address,
      deployed.RMMakeOrders.address,
      deployed.PriceFeed.address,
      [deployed.SimpleMarket.address, SimpleMarket2.address],
      [deployed.SimpleAdapter.address, deployed.SimpleAdapter.address],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  fund = await retrieveContract("Fund", fundAddress);
});

test.beforeEach(async () => {
  runningGasTotal = new BigNumber(0);

  await updatePriceFeed(deployed);

  const [, referencePrice] = await pricefeed.instance.getReferencePrice.call(
    {},
    [mlnToken.address, ethToken.address],
  );
  const [
    ,
    invertedReferencePrice,
  ] = await pricefeed.instance.getReferencePrice.call({}, [
    ethToken.address,
    mlnToken.address,
  ]);
  const sellQuantity1 = 1000;
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: Math.round(referencePrice / 10 ** 18 * sellQuantity1),
  };
  const sellQuantity2 = 50;
  trade2 = {
    sellQuantity: sellQuantity2,
    buyQuantity: Math.round(referencePrice / 10 ** 18 * sellQuantity2),
  };
  const sellQuantity3 = 5;
  trade3 = {
    sellQuantity: sellQuantity3,
    buyQuantity: Math.round(
      invertedReferencePrice / 10 ** 18 * sellQuantity3 / 10,
    ),
  };
  const sellQuantity4 = 5;
  trade4 = {
    sellQuantity: sellQuantity4,
    buyQuantity: Math.round(
      invertedReferencePrice / 10 ** 18 * sellQuantity4 * 1000,
    ),
  };
});

const initialTokenAmount = new BigNumber(10 ** 15);
test.serial("investor receives initial mlnToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const preDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  receipt = await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialTokenAmount, ""],
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    postDeployerEth.toString(),
    preDeployerEth.minus(runningGasTotal.times(gasPrice)).toString(),
  );
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

const exchangeIndexes = Array.from(new Array(numberofExchanges), (val, index) => index);
exchangeIndexes.forEach((i) => {
  test.serial(
    `fund receives MLN from a subscription (request & execute) [round ${i}]`,
    async t => {
      let investorGasTotal = new BigNumber(0);
      await mlnToken.instance.transfer.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [investor, 10 ** 14, ""],
      );
      const pre = await getAllBalances(deployed, accounts, fund);
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: investor, gasPrice: config.gasPrice, gas: config.gas },
        [fund.address, offeredValue],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      receipt = await fund.instance.requestSubscription.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [offeredValue, wantedShares, false],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      await updatePriceFeed(deployed);
      await updatePriceFeed(deployed);
      const sharePrice = await fund.instance.calcSharePrice.call({}, []);
      const requestId = await fund.instance.getLastRequestId.call({}, []);
      receipt = await fund.instance.executeRequest.postTransaction(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice },
        [requestId],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      investorGasTotal = investorGasTotal.plus(gasUsed);
      const estimatedMlnToSpend = Number(
        new BigNumber(offeredValue)
          .times(sharePrice)
          .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
          .floor(),
      );
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken + estimatedMlnToSpend);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    `Exchange ${i +
      1}: manager makes order, and sellToken (MLN-T) is transferred to exchange`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      await updatePriceFeed(deployed);
      receipt = await fund.instance.makeOrder.postTransaction(
        { from: manager, gas: config.gas, gasPrice: config.gasPrice },
        [
          i,
          mlnToken.address,
          ethToken.address,
          trade1.sellQuantity,
          trade1.buyQuantity,
        ],
      );
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln + trade1.sellQuantity);
      t.deepEqual(exchangePostEthToken, exchangePreEthToken);
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(
        post.manager.ether,
        pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken - trade1.sellQuantity);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    `Exchange ${i +
      1}: third party takes entire order, allowing fund to receive ethToken`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const orderId = await exchanges[i].instance.last_offer_id.call({}, []);
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      receipt = await ethToken.instance.approve.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [exchanges[i].address, trade1.buyQuantity + 100],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      receipt = await exchanges[i].instance.buy.postTransaction(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
        [orderId, trade1.sellQuantity],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln - trade1.sellQuantity);
      t.deepEqual(exchangePostEthToken, exchangePreEthToken);
      t.deepEqual(
        post.deployer.ether,
        pre.deployer.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(
        post.deployer.MlnToken,
        pre.deployer.MlnToken + trade1.sellQuantity,
      );
      t.deepEqual(
        post.deployer.EthToken,
        pre.deployer.EthToken - trade1.buyQuantity,
      );
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken + trade1.buyQuantity);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    `Exchange ${i +
      1}: third party makes order (sell MLN-T for ETH-T), and MLN-T is transferred to exchange`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      receipt = await mlnToken.instance.approve.postTransaction(
        { from: deployer, gasPrice: config.gasPrice },
        [exchanges[i].address, trade2.sellQuantity],
      );
      let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      receipt = await exchanges[i].instance.offer.postTransaction(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
        [
          trade2.sellQuantity,
          mlnToken.address,
          trade2.buyQuantity,
          ethToken.address,
        ],
      );
      gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln + trade2.sellQuantity);
      t.deepEqual(exchangePostEthToken, exchangePreEthToken);
      t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
      t.deepEqual(
        post.deployer.EthToken,
        pre.deployer.EthToken - trade2.sellQuantity,
      );
      t.deepEqual(
        post.deployer.ether,
        pre.deployer.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    `Exchange ${i + 1}: manager takes order (buys MLN-T for ETH-T)`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const exchangePreMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePreEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const orderId = await exchanges[i].instance.last_offer_id.call({}, []);
      receipt = await fund.instance.takeOrder.postTransaction(
        { from: manager, gas: config.gas, gasPrice: config.gasPrice },
        [i, orderId, trade2.sellQuantity],
      );
      const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
      runningGasTotal = runningGasTotal.plus(gasUsed);
      const exchangePostMln = Number(
        await mlnToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const exchangePostEthToken = Number(
        await ethToken.instance.balanceOf.call({}, [exchanges[i].address]),
      );
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln - trade2.sellQuantity);
      t.deepEqual(exchangePostEthToken, exchangePreEthToken);
      t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
      t.deepEqual(
        post.deployer.EthToken,
        pre.deployer.EthToken + trade2.buyQuantity,
      );
      t.deepEqual(post.deployer.ether, pre.deployer.ether);
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(
        post.manager.ether,
        pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken + trade2.sellQuantity);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken - trade2.buyQuantity);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );
});

test.serial(
  "manager tries to make a bad order (sell ETH-T for MLN-T), RMMakeOrders should prevent this",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const preOrderId = await exchanges[0].instance.last_offer_id.call({}, []);
    receipt = await fund.instance.makeOrder.postTransaction(
      { from: manager, gas: config.gas, gasPrice: config.gasPrice },
      [
        0,
        ethToken.address,
        mlnToken.address,
        trade3.sellQuantity,
        trade3.buyQuantity,
      ],
    );
    const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    const exchangePostEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const post = await getAllBalances(deployed, accounts, fund);
    const postOrderId = await exchanges[0].instance.last_offer_id.call({}, []);

    t.deepEqual(preOrderId, postOrderId);
    t.deepEqual(exchangePostEthToken, exchangePreEthToken);
    t.deepEqual(
      post.manager.ether,
      pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  },
);

test.serial(
  "third party makes order (sell ETH-T for MLN-T) for a bad price, and MLN-T is transferred to exchange",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreMln = Number(
      await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const exchangePreEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    receipt = await ethToken.instance.approve.postTransaction(
      { from: deployer, gasPrice: config.gasPrice },
      [exchanges[0].address, trade4.sellQuantity],
    );
    let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    receipt = await exchanges[0].instance.offer.postTransaction(
      { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
      [
        trade4.sellQuantity,
        ethToken.address,
        trade4.buyQuantity,
        mlnToken.address,
      ],
    );
    gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    const exchangePostMln = Number(
      await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const exchangePostEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(exchangePostMln, exchangePreMln);
    t.deepEqual(
      exchangePostEthToken,
      exchangePreEthToken + trade4.sellQuantity,
    );
    t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
    t.deepEqual(
      post.deployer.EthToken,
      pre.deployer.EthToken - trade4.sellQuantity,
    );
    t.deepEqual(
      post.deployer.ether,
      pre.deployer.ether.minus(runningGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial(
  "manager tried to take a bad order (buys ETH-T for MLN-T), RMMakeOrders should prevent it",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreMln = Number(
      await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const exchangePreEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const orderId = await exchanges[0].instance.last_offer_id.call({}, []);
    receipt = await fund.instance.takeOrder.postTransaction(
      { from: manager, gas: config.gas, gasPrice: config.gasPrice },
      [0, orderId, trade4.sellQuantity],
    );
    const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    const exchangePostMln = Number(
      await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const exchangePostEthToken = Number(
      await ethToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(exchangePostMln, exchangePreMln);
    t.deepEqual(exchangePostEthToken, exchangePreEthToken);
    t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
    t.deepEqual(post.deployer.EthToken, pre.deployer.EthToken);
    t.deepEqual(post.deployer.ether, pre.deployer.ether);
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(post.investor.ether, pre.investor.ether);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(
      post.manager.ether,
      pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial(
  "manager makes an order and cancels it",
  async t => {
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
    const exchangePreEthToken = Number(
      await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const orderId = await fund.instance.getLastOrderId.call({}, []);
    receipt = await fund.instance.cancelOrder.postTransaction(
      { from: manager, gas: config.gas, gasPrice: config.gasPrice },
      [
        0,
        orderId
      ],
    );
    const [, orderStatus] = await fund.instance.orders.call({}, [orderId]);
    const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    runningGasTotal = runningGasTotal.plus(gasUsed);
    const exchangePostEthToken = Number(
      await mlnToken.instance.balanceOf.call({}, [exchanges[0].address]),
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(exchangePostEthToken, exchangePreEthToken - trade1.sellQuantity);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken + trade1.sellQuantity);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
    t.deepEqual(
      post.manager.ether,
      pre.manager.ether.minus(runningGasTotal.times(gasPrice))
    );
    t.is(Number(orderStatus), 3);
  },
);

// redeeming after trading
const redemptions = [
  { amount: new BigNumber(100000000) },
  { amount: new BigNumber(150000000) },
];
redemptions.forEach((redemption, index) => {
  test.serial(`Allows redemption ${index + 1} (standard redemption method)`, async t => {
    let investorGasTotal = new BigNumber(0);
    const investorPreShares = Number(
      await fund.instance.balanceOf.call({}, [investor]),
    );
    const preTotalShares = Number(await fund.instance.totalSupply.call({}, []));
    const sharePrice = await fund.instance.calcSharePrice.call({}, []);
    const wantedValue = Number(
      redemption.amount
        .times(sharePrice)
        .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
        .floor(),
    );
    const pre = await getAllBalances(deployed, accounts, fund);
    receipt = await fund.instance.requestRedemption.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [redemption.amount, wantedValue, false],
    );
    let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    await updatePriceFeed(deployed);
    await updatePriceFeed(deployed);
    const requestId = await fund.instance.getLastRequestId.call({}, []);
    receipt = await fund.instance.executeRequest.postTransaction(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice },
      [requestId],
    );
    gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    // reduce remaining allowance to zero
    receipt = await mlnToken.instance.approve.postTransaction(
      { from: investor, gasPrice: config.gasPrice },
      [fund.address, 0],
    );
    gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
    investorGasTotal = investorGasTotal.plus(gasUsed);
    const remainingApprovedMln = Number(
      await mlnToken.instance.allowance.call({}, [investor, fund.address]),
    );
    const investorPostShares = Number(
      await fund.instance.balanceOf.call({}, [investor]),
    );
    const postTotalShares = Number(
      await fund.instance.totalSupply.call({}, []),
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(remainingApprovedMln, 0);
    t.deepEqual(postTotalShares, preTotalShares - redemption.amount);
    t.deepEqual(investorPostShares, investorPreShares - redemption.amount);
    t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
    t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
    t.deepEqual(
      post.investor.MlnToken,
      pre.investor.MlnToken + wantedValue,
    );
    t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
    t.deepEqual(
      post.investor.ether,
      pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
    );
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken - wantedValue);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  });
});

test.serial(`Allows subscription in native asset`, async t => {
  let investorGasTotal = new BigNumber(0);
  await ethToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, 10 ** 14, ""],
  );
  const pre = await getAllBalances(deployed, accounts, fund);
  const investorPreShares = Number(
    await fund.instance.balanceOf.call({}, [investor])
  );
  const sharePrice = await fund.instance.calcSharePrice.call({}, []);
  const [, invertedNativeAssetPrice, nativeAssetDecimal] = await pricefeed.instance.getInvertedPrice.call(
    {},
    [ethToken.address],
  );
  const wantedShareQuantity = 10 ** 10;
  const giveQuantity = Number(
    new BigNumber(wantedShareQuantity)
      .times(sharePrice)
      .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
      .times(invertedNativeAssetPrice)
      .dividedBy(new BigNumber(10 ** nativeAssetDecimal))
      .times(new BigNumber(1.2)) // For price fluctuations
      .floor()
  );
  receipt = await ethToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, giveQuantity],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updatePriceFeed(deployed);
  receipt = await fund.instance.requestSubscription.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [giveQuantity, wantedShareQuantity, true],
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updatePriceFeed(deployed);
  await updatePriceFeed(deployed);
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  receipt = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const post = await getAllBalances(deployed, accounts, fund);
  const investorPostShares = Number(
    await fund.instance.balanceOf.call({}, [investor])
  );

  t.is(Number(investorPostShares), investorPreShares + wantedShareQuantity);
  t.true(post.investor.EthToken >= pre.investor.EthToken - giveQuantity);
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.true(post.fund.EthToken <= pre.fund.EthToken + giveQuantity);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial(`Allows redemption in native asset`, async t => {
  let investorGasTotal = new BigNumber(0);
  const pre = await getAllBalances(deployed, accounts, fund);
  const investorPreShares = Number(
    await fund.instance.balanceOf.call({}, [investor])
  );
  await updatePriceFeed(deployed);
  const sharePrice = await fund.instance.calcSharePrice.call({}, []);
  const [, invertedNativeAssetPrice, nativeAssetDecimal] = await pricefeed.instance.getInvertedPrice.call(
    {},
    [ethToken.address],
  );
  const shareQuantity = 10 ** 3;
  const receiveQuantity = Number(
    new BigNumber(shareQuantity)
      .times(sharePrice)
      .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
      .times(invertedNativeAssetPrice)
      .dividedBy(new BigNumber(10 ** nativeAssetDecimal))
      .times(new BigNumber(0.9)) // For price fluctuations
      .floor()
  );
  receipt = await fund.instance.requestRedemption.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [shareQuantity, receiveQuantity, true],
  );
  let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updatePriceFeed(deployed);
  await updatePriceFeed(deployed);
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  receipt = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const post = await getAllBalances(deployed, accounts, fund);
  const investorPostShares = Number(
    await fund.instance.balanceOf.call({}, [investor])
  );

  t.is(Number(investorPostShares), investorPreShares - shareQuantity);
  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.true(post.investor.EthToken >= pre.investor.EthToken - receiveQuantity);
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken - (post.investor.EthToken - pre.investor.EthToken));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

test.serial(`Allows redemption by tokenFallback method)`, async t => {
  const redemptionAmount = new BigNumber(120000000);
  let investorGasTotal = new BigNumber(0);
  const investorPreShares = Number(
    await fund.instance.balanceOf.call({}, [investor]),
  );
  const preTotalShares = Number(await fund.instance.totalSupply.call({}, []));
  const pre = await getAllBalances(deployed, accounts, fund);
  receipt = await fund.instance.transfer.postTransaction(
    { from: investor, gasPrice: config.gasPrice , gas: config.gas},
    [fund.address, redemptionAmount, '']
  );
  let gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  await updatePriceFeed(deployed);
  await updatePriceFeed(deployed);
  const sharePrice = await fund.instance.calcSharePrice.call({}, []);
  const wantedValue = Number(
    redemptionAmount
      .times(sharePrice)
      .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
      .floor()
  );
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  receipt = await fund.instance.executeRequest.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  // reduce remaining allowance to zero
  receipt = await mlnToken.instance.approve.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [fund.address, 0],
  );
  gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  investorGasTotal = investorGasTotal.plus(gasUsed);
  const remainingApprovedMln = Number(
    await mlnToken.instance.allowance.call({}, [investor, fund.address]),
  );
  const investorPostShares = Number(
    await fund.instance.balanceOf.call({}, [investor]),
  );
  const postTotalShares = Number(
    await fund.instance.totalSupply.call({}, []),
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(remainingApprovedMln, 0);
  t.deepEqual(postTotalShares, preTotalShares - redemptionAmount);
  t.deepEqual(investorPostShares, investorPreShares - redemptionAmount);
  t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
  t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
  t.deepEqual(
    post.investor.MlnToken,
    pre.investor.MlnToken + wantedValue,
  );
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken - wantedValue);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// Rewards
test.serial("converts rewards and manager receives them", async t => {
  await updatePriceFeed(deployed);
  const pre = await getAllBalances(deployed, accounts, fund);
  const preManagerShares = Number(
    await fund.instance.balanceOf.call({}, [manager]),
  );
  const totalSupply = Number(await fund.instance.totalSupply.call({}, []));
  const [gav, , , unclaimedRewards, ,] = Object.values(
    await fund.instance.performCalculations.call({}, []),
  );
  const shareQuantity = Math.floor(totalSupply * unclaimedRewards / gav);
  receipt = await fund.instance.allocateUnclaimedRewards.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [],
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const postManagerShares = Number(
    await fund.instance.balanceOf.call({}, [manager]),
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(postManagerShares, preManagerShares + shareQuantity);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// shutdown fund
test.serial("manager can shut down a fund", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  receipt = await version.instance.shutDownFund.postTransaction(
    { from: manager, gasPrice: config.gasPrice },
    [fund.address],
  );
  const gasUsed = (await api.eth.getTransactionReceipt(receipt)).gasUsed;
  const isShutDown = await fund.instance.isShutDown.call({}, []);
  runningGasTotal = runningGasTotal.plus(gasUsed);
  const post = await getAllBalances(deployed, accounts, fund);

  t.true(isShutDown);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});
