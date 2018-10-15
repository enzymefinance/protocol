import test from "ava";
import web3 from "../../utils/lib/web3";
import api from "../../utils/lib/api";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import deployEnvironment from "../../utils/deploy/contracts";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import getFundComponents from "../../utils/lib/getFundComponents";
import { updateTestingPriceFeed } from "../../utils/lib/updatePriceFeed";
import { makeOrderSignature, takeOrderSignature, cancelOrderSignature } from "../../utils/lib/data";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

BigNumber.config({ ERRORS: false });

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
let exchanges;
let trade1;
let trade2;
let trade3;
let trade4;
let version;
let deployed;

// mock data
const offeredValue = new BigNumber(10 ** 22);
const wantedShares = new BigNumber(10 ** 22);
const numberofExchanges = 1;    // TODO: add back in a second exchange when implemented

test.before(async t => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  gasPrice = config.gasPrice;
  [deployer, manager, investor] = accounts;
  version = await deployed.Version;
  pricefeed = await deployed.TestingPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  exchanges = [deployed.MatchingMarket]; //, matchingMarket2];

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await deployed.FundFactory.methods.createComponents(
    [deployed.MatchingMarket.options.address], [deployed.MatchingMarketAdapter.options.address], [deployed.EthToken.options.address, deployed.MlnToken.options.address], [false], deployed.TestingPriceFeed.options.address
  ).send({from: manager, gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.continueCreation().send({from: manager, gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.setupFund().send({from: manager, gasPrice: config.gasPrice});
  const fundId = await deployed.FundFactory.methods.getLastFundId().call();
  const hubAddress = await deployed.FundFactory.methods.getFundById(fundId).call();
  fund = await getFundComponents(hubAddress);

  // Register price tolerance policy
  const priceTolerance = await deployContract('fund/risk-management/PriceTolerance', { from: manager, gas: config.gas, gasPrice: config.gasPrice }, [10])
  await t.notThrows(fund.policyManager.methods.register(makeOrderSignature, priceTolerance.options.address).send({ from: manager, gasPrice: config.gasPrice }));
  await t.notThrows(fund.policyManager.methods.register(takeOrderSignature, priceTolerance.options.address).send({ from: deployer, gasPrice: config.gasPrice }));
});

test.beforeEach(async () => {
  runningGasTotal = new BigNumber(0);
  await updateTestingPriceFeed(deployed);

  const [
    ,
    referencePrice,
  ] = Object.values(await pricefeed.methods.getReferencePriceInfo(
    ethToken.options.address,
    mlnToken.options.address,
  ).call()).map(e => new BigNumber(e));
  const [
    ,
    invertedReferencePrice,
  ] = Object.values(await pricefeed.methods.getReferencePriceInfo(
    mlnToken.options.address,
    ethToken.options.address,
  ).call()).map(e => new BigNumber(e));
  const sellQuantity1 = new BigNumber(10 ** 21);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: new BigNumber(
      Math.floor(referencePrice.div(10 ** 18).times(sellQuantity1)),
    ),
  };
  const sellQuantity2 = new BigNumber(50 * 10 ** 18);
  trade2 = {
    sellQuantity: sellQuantity2,
    buyQuantity: new BigNumber(
      Math.floor(referencePrice.div(10 ** 18).times(sellQuantity2)),
    ),
  };
  const sellQuantity3 = new BigNumber(5 * 10 ** 18);
  trade3 = {
    sellQuantity: sellQuantity3,
    buyQuantity: new BigNumber(
      Math.floor(invertedReferencePrice.div(10 ** 18).times(sellQuantity3).div(10)),
    ),
  };
  const sellQuantity4 = new BigNumber(5 * 10 ** 18);
  trade4 = {
    sellQuantity: sellQuantity4,
    buyQuantity: new BigNumber(
      Math.floor(invertedReferencePrice.div(10 ** 18).times(sellQuantity4).times(1000)),
    ),
  };
});

const initialTokenAmount = new BigNumber(10 ** 23);
test.serial("investor receives initial ethToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const preDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  receipt = await ethToken.methods.transfer(investor, initialTokenAmount).send(
    { from: deployer, gasPrice: config.gasPrice }
  );
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  const postDeployerEth = new BigNumber(await api.eth.getBalance(deployer));
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    postDeployerEth,
    preDeployerEth.minus(runningGasTotal.times(config.gasPrice)),
  );
  t.deepEqual(
    post.investor.EthToken,
    pre.investor.EthToken.add(initialTokenAmount),
  );
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

const exchangeIndexes = Array.from(
  new Array(numberofExchanges),
  (val, index) => index,
);

exchangeIndexes.forEach(i => {
  test.serial(
    `fund gets ETH Token from investment [round ${i + 1}]`,
    async t => {
      const boostedOffer = offeredValue.times(1.01); // account for increasing share price after trades occur
      let investorGasTotal = new BigNumber(0);
      await ethToken.methods.transfer(investor, new BigNumber(10 ** 14)).send(
        { from: deployer, gasPrice: config.gasPrice }
      );
      const pre = await getAllBalances(deployed, accounts, fund);
      receipt = await ethToken.methods.approve(fund.participation.options.address, boostedOffer).send(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice }
      );
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
      receipt = await fund.participation.methods.requestInvestment(wantedShares, boostedOffer, ethToken.options.address).send(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice }
      );
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
      await updateTestingPriceFeed(deployed);
      await updateTestingPriceFeed(deployed);

      const totalSupply = await fund.shares.methods.totalSupply().call();
      receipt = await fund.participation.methods.executeRequest().send({from: investor, gas: 6000000, gasPrice: config.gasPrice});
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
      // set approved token back to zero
      receipt = await ethToken.methods.approve(fund.participation.options.address, 0).send(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice }
      );
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
      const post = await getAllBalances(deployed, accounts, fund);
      const [gav, unclaimedFees, , ,] = Object.values(
        await fund.accounting.methods.performCalculations().call(),
      ).map(e => new BigNumber(e));
      const feesShareQuantity = parseInt(
        unclaimedFees
          .mul(totalSupply)
          .div(gav)
          .toNumber(),
        0,
      );

      let sharePrice;
      if (Number(totalSupply) === 0) {
        sharePrice = new BigNumber(10 ** 18);
      }
      else {
        const totalSupplyWithFees = new BigNumber(totalSupply).add(feesShareQuantity);
        sharePrice = new BigNumber(await fund.accounting.methods.calcValuePerShare(gav, totalSupplyWithFees).call());
      }

      const estimatedEthSpent = wantedShares
        .times(sharePrice)
        .dividedBy(new BigNumber(10 ** 18));

      t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(
        post.investor.EthToken,
        pre.investor.EthToken.minus(estimatedEthSpent),
      );
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(estimatedEthSpent));
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(`Exchange ${i+1}: manager makes order, sellToken sent to exchange`, async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreMln = new BigNumber(await mlnToken.methods.balanceOf(exchanges[i].options.address).call());
    const exchangePreEthToken = new BigNumber(await ethToken.methods.balanceOf(exchanges[i].options.address).call());
    await updateTestingPriceFeed(deployed);
    receipt = await fund.trading.methods.callOnExchange(
      i,
      makeOrderSignature,
      ["0x0", "0x0", ethToken.options.address, mlnToken.options.address, "0x0"],
      [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
      web3.utils.padLeft('0x0', 64),
      0,
      web3.utils.padLeft('0x0', 64),
      web3.utils.padLeft('0x0', 64),
    ).send({ from: manager, gas: config.gas, gasPrice: config.gasPrice });
    runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
    const exchangePostMln = new BigNumber(await mlnToken.methods.balanceOf(exchanges[i].options.address).call());
    const exchangePostEthToken = new BigNumber(await ethToken.methods.balanceOf(exchanges[i].options.address).call());
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(exchangePostMln, exchangePreMln);
    t.deepEqual(
      exchangePostEthToken,
      exchangePreEthToken.add(trade1.sellQuantity),
    );
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
    t.deepEqual(
      post.fund.EthToken,
      pre.fund.EthToken.minus(trade1.sellQuantity),
    );
    t.deepEqual(post.fund.ether, pre.fund.ether);
  });
  
  test.serial(
    `Exchange ${i +
      1}: third party takes entire order, allowing fund to receive mlnToken`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const orderId = await exchanges[i].methods.last_offer_id().call();
      const exchangePreMln = Number(
        await mlnToken.methods.balanceOf(exchanges[i].options.address).call(),
      );
      const exchangePreEthToken = Number(
        await ethToken.methods.balanceOf(exchanges[i].options.address).call(),
      );
      receipt = await mlnToken.methods.approve(exchanges[i].options.address, trade1.buyQuantity.add(100)).send(
        { from: deployer, gasPrice: config.gasPrice },
      );
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      receipt = await exchanges[i].methods.buy(orderId, trade1.sellQuantity).send(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
      );
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      const exchangePostMln = Number(
        await mlnToken.methods.balanceOf(exchanges[i].options.address).call(),
      );
      const exchangePostEthToken = Number(
        await ethToken.methods.balanceOf(exchanges[i].options.address).call(),
      );
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln);
      t.deepEqual(
        exchangePostEthToken,
        exchangePreEthToken - trade1.sellQuantity,
      );
      t.deepEqual(
        post.deployer.ether,
        pre.deployer.ether.minus(runningGasTotal.times(config.gasPrice)),
      );
      t.deepEqual(
        post.deployer.MlnToken,
        pre.deployer.MlnToken.minus(trade1.buyQuantity),
      );
      t.deepEqual(
        post.deployer.EthToken,
        pre.deployer.EthToken.add(trade1.sellQuantity),
      );
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
      t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
      t.deepEqual(post.investor.ether, pre.investor.ether);
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(
        post.fund.MlnToken,
        pre.fund.MlnToken.add(trade1.buyQuantity),
      );
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );

  test.serial(
    `Exchange ${i +
      1}: third party makes order (sell ETH-T for MLN-T), and ETH-T is transferred to exchange`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const exchangePreMln = new BigNumber(await mlnToken.methods.balanceOf(exchanges[i].options.address).call());
      const exchangePreEthToken = new BigNumber(await ethToken.methods.balanceOf(exchanges[i].options.address).call());
      receipt = await ethToken.methods.approve(exchanges[i].options.address, trade2.sellQuantity).send(
        { from: deployer, gasPrice: config.gasPrice },
      );
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      receipt = await exchanges[i].methods.offer(
          trade2.sellQuantity,
          ethToken.options.address,
          trade2.buyQuantity,
          mlnToken.options.address,
        ).send(
        { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
      );
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      const exchangePostMln = new BigNumber(await mlnToken.methods.balanceOf(exchanges[i].options.address).call());
      const exchangePostEthToken = new BigNumber(await ethToken.methods.balanceOf(exchanges[i].options.address).call());
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln);
      t.deepEqual(
        exchangePostEthToken,
        exchangePreEthToken.add(trade2.sellQuantity),
      );
      t.deepEqual(
        post.deployer.EthToken,
        pre.deployer.EthToken.minus(trade2.sellQuantity),
      );
      t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
      t.deepEqual(
        post.deployer.ether,
        pre.deployer.ether.minus(runningGasTotal.times(config.gasPrice)),
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
    `Exchange ${i + 1}: manager takes order (buys ETH-T for MLN-T)`,
    async t => {
      const pre = await getAllBalances(deployed, accounts, fund);
      const exchangePreMln = await mlnToken.methods.balanceOf(exchanges[i].options.address).call();
      const exchangePreEthToken = await ethToken.methods.balanceOf(exchanges[i].options.address).call();
      const orderId = await exchanges[i].methods.last_offer_id().call();
      receipt = await fund.trading.methods.callOnExchange(
        i,
        takeOrderSignature,
        ["0x0", "0x0", "0x0", "0x0", "0x0"],
        [0, 0, 0, 0, 0, 0, trade2.buyQuantity, 0],
        `0x${Number(orderId).toString(16).padStart(64, "0")}`,
        0,
        web3.utils.padLeft('0x0', 64),
        web3.utils.padLeft('0x0', 64),
      ).send(
        { from: manager, gas: config.gas, gasPrice: config.gasPrice }
      );
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      receipt = await fund.trading.methods.returnToVault([mlnToken.options.address, ethToken.options.address]).send({from: manager, gas: config.gas, gasPrice: config.gasPrice});
      runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
      const exchangePostMln = await mlnToken.methods.balanceOf(exchanges[i].options.address).call();
      const exchangePostEthToken = await ethToken.methods.balanceOf(exchanges[i].options.address).call();
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(exchangePostMln, exchangePreMln);
      t.deepEqual(
        Number(exchangePostEthToken),
        Number(exchangePreEthToken) - trade2.sellQuantity,
      );
      t.deepEqual(
        post.deployer.MlnToken,
        pre.deployer.MlnToken.add(trade2.buyQuantity),
      );
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
      t.deepEqual(
        post.fund.MlnToken,
        pre.fund.MlnToken.minus(trade2.buyQuantity),
      );
      t.deepEqual(
        post.fund.EthToken,
        pre.fund.EthToken.add(trade2.sellQuantity),
      );
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );
});

test.serial(
  "manager tries to make a bad order (sell MLN-T for ETH-T), RMMakeOrders should prevent this",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreEthToken = await ethToken.methods.balanceOf(exchanges[0].options.address).call();
    const preOrderId = await exchanges[0].methods.last_offer_id().call();
    receipt = await t.throws(fund.trading.methods.callOnExchange(
      0,
      makeOrderSignature,
      ["0x0", "0x0", mlnToken.options.address, ethToken.options.address, "0x0"],
      [trade3.sellQuantity, trade3.buyQuantity, 0, 0, 0, 0, 0, 0],
      web3.utils.padLeft('0x0', 64),
      0,
      web3.utils.padLeft('0x0', 64),
      web3.utils.padLeft('0x0', 64),
    ).send(
      { from: manager, gas: config.gas }
    ));

    const exchangePostEthToken = await ethToken.methods.balanceOf(exchanges[0].options.address).call();
    const post = await getAllBalances(deployed, accounts, fund);
    const postOrderId = await exchanges[0].methods.last_offer_id().call();

    t.deepEqual(preOrderId, postOrderId);
    t.deepEqual(exchangePostEthToken, exchangePreEthToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  },
);

test.serial(
  "third party makes order (sell ETH-T for MLN-T) for a bad price, and MLN-T is transferred to exchange",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreMln = new BigNumber(await mlnToken.methods.balanceOf(exchanges[0].options.address).call());
    const exchangePreEthToken = new BigNumber(await ethToken.methods.balanceOf(exchanges[0].options.address).call());
    receipt = await ethToken.methods.approve(exchanges[0].options.address, trade4.sellQuantity).send(
      { from: deployer, gasPrice: config.gasPrice }
    );
    runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
    receipt = await exchanges[0].methods.offer(
        trade4.sellQuantity,
        ethToken.options.address,
        trade4.buyQuantity,
        mlnToken.options.address,
      ).send(
      { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
    );
    runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
    const exchangePostMln = new BigNumber(await mlnToken.methods.balanceOf(exchanges[0].options.address).call());
    const exchangePostEthToken = new BigNumber(await ethToken.methods.balanceOf(exchanges[0].options.address).call());
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(exchangePostMln, exchangePreMln);
    t.deepEqual(
      exchangePostEthToken,
      exchangePreEthToken.add(trade4.sellQuantity),
    );
    t.deepEqual(post.deployer.MlnToken, pre.deployer.MlnToken);
    t.deepEqual(
      post.deployer.EthToken,
      pre.deployer.EthToken.minus(trade4.sellQuantity),
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
  "manager tries to take a bad order (buys ETH-T for MLN-T), RMMakeOrders should prevent it",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    const exchangePreMln = Number(
      await mlnToken.methods.balanceOf(exchanges[0].options.address).call(),
    );
    const exchangePreEthToken = Number(
      await ethToken.methods.balanceOf(exchanges[0].options.address).call(),
    );
    const orderId = await exchanges[0].methods.last_offer_id().call();

    await t.throws(fund.trading.methods.callOnExchange(
      0,
      takeOrderSignature,
      ["0x0", "0x0", "0x0", "0x0", "0x0"],
      [0, 0, 0, 0, 0, 0, trade4.buyQuantity, 0],
      `0x${Number(orderId)
        .toString(16)
        .padStart(64, "0")}`,
      0,
      web3.utils.padLeft('0x0', 64),
      web3.utils.padLeft('0x0', 64),
    ).send(
      { from: manager, gas: config.gas }
    ));
    const exchangePostMln = Number(
      await mlnToken.methods.balanceOf(exchanges[0].options.address).call(),
    );
    const exchangePostEthToken = Number(
      await ethToken.methods.balanceOf(exchanges[0].options.address).call(),
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
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

test.serial("manager makes an order and cancels it", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const exchangePreEthToken = Number(
    await mlnToken.methods.balanceOf(exchanges[0].options.address).call(),
  );
  receipt = await fund.trading.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", ethToken.options.address, mlnToken.options.address, "0x0"],
    [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send({from: manager, gas: config.gas, gasPrice: config.gasPrice});
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  const offerNumber = await deployed.MatchingMarket.methods.last_offer_id().call();
  
  receipt = await fund.trading.methods.callOnExchange(
    0,
    cancelOrderSignature,
    ["0x0", "0x0", ethToken.options.address, "0x0", "0x0"],
    [0, 0, 0, 0, 0, 0, 0, 0],
    `0x${Number(offerNumber)
      .toString(16)
      .padStart(64, "0")}`,
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send({from: manager, gas: config.gas, gasPrice: config.gasPrice});
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  receipt = await fund.trading.methods.returnToVault([mlnToken.options.address, ethToken.options.address]).send({from: manager, gas: config.gas, gasPrice: config.gasPrice});
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);

  const orderId = await exchanges[0].methods.last_offer_id().call();
  const orderOpen = await exchanges[0].methods.isActive(orderId).call();
  const exchangePostEthToken = Number(
    await mlnToken.methods.balanceOf(exchanges[0].options.address).call(),
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.false(orderOpen);
  t.deepEqual(exchangePostEthToken, exchangePreEthToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
  t.deepEqual(
    post.manager.ether,
    pre.manager.ether.minus(runningGasTotal.times(gasPrice)),
  );
});

// redeeming after trading
const redemptions = [
  { amount: new BigNumber(10 ** 7) },
  { amount: new BigNumber(2 * 10 ** 7) },
];
redemptions.forEach((redemption, index) => {
  test.serial(
    `Allows redemption ${index + 1} (standard redemption method)`,
    async t => {
      let investorGasTotal = new BigNumber(0);
      const investorPreShares = new BigNumber(await fund.shares.methods.balanceOf(
        investor,
      ).call());
      const preTotalShares = new BigNumber(await fund.shares.methods.totalSupply().call());
      const pre = await getAllBalances(deployed, accounts, fund);
      const mlnInCustody = new BigNumber(await fund.trading.methods.quantityHeldInCustodyOfExchange(
        deployed.MlnToken.options.address,
      ).call());
      const ethTokenInCustody = new BigNumber(await fund.trading.methods.quantityHeldInCustodyOfExchange(
        deployed.EthToken.options.address,
      ).call());
      const expectedMlnRedemption = new BigNumber(pre.fund.MlnToken).add(mlnInCustody).mul(redemption.amount).dividedToIntegerBy(preTotalShares);
      const expectedEthTokenRedemption = new BigNumber(pre.fund.EthToken).add(ethTokenInCustody).mul(redemption.amount).dividedToIntegerBy(preTotalShares);
      receipt = await fund.participation.methods.redeemQuantity(redemption.amount).send(
        { from: investor, gas: config.gas, gasPrice: config.gasPrice }
      );
      investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
      const remainingApprovedEthToken = await ethToken.methods.allowance(investor, fund.participation.options.address).call();
      const investorPostShares = new BigNumber(await fund.shares.methods.balanceOf(
        investor,
      ).call());
      const postTotalShares = new BigNumber(await fund.shares.methods.totalSupply().call());
      const post = await getAllBalances(deployed, accounts, fund);

      t.deepEqual(Number(remainingApprovedEthToken), 0);
      t.deepEqual(
        postTotalShares,
        preTotalShares.minus(redemption.amount),
      );
      t.deepEqual(
        investorPostShares,
        investorPreShares.minus(redemption.amount),
      );
      t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
      t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
      t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken.add(expectedMlnRedemption));
      t.deepEqual(
        post.investor.EthToken,
        pre.investor.EthToken.add(expectedEthTokenRedemption),
      );
      t.deepEqual(
        post.investor.ether,
        pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
      );
      t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
      t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
      t.deepEqual(post.manager.ether, pre.manager.ether);
      t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.sub(expectedMlnRedemption));
      t.deepEqual(post.fund.EthToken, pre.fund.EthToken.sub(expectedEthTokenRedemption));
      t.deepEqual(post.fund.ether, pre.fund.ether);
    },
  );
});

// TODO: test investment in another asset (changed to ETH above)
test.serial(`Allows investment in native asset`, async t => {
  let investorGasTotal = new BigNumber(0);
  await ethToken.methods.transfer(investor, 10 ** 14).send(
    { from: deployer, gasPrice: config.gasPrice }
  );
  const pre = await getAllBalances(deployed, accounts, fund);
  const investorPreShares = Number(
    await fund.shares.methods.balanceOf(investor).call(),
  );
  const sharePrice = await fund.accounting.methods.calcSharePrice().call();
  const [
    ,
    invertedNativeAssetPrice,
    nativeAssetDecimal,
  ] = Object.values(await pricefeed.methods.getInvertedPriceInfo(
    ethToken.options.address,
  ).call()).map(e => BigNumber(e));
  const wantedShareQuantity = 10 ** 10;
  const giveQuantity = Number(
    new BigNumber(wantedShareQuantity)
      .times(sharePrice)
      .dividedBy(new BigNumber(10 ** 18)) // toSmallestShareUnit
      .times(invertedNativeAssetPrice)
      .dividedBy(new BigNumber(10 ** nativeAssetDecimal))
      .times(new BigNumber(1.2)) // For price fluctuations
      .floor(),
  );
  receipt = await ethToken.methods.approve(fund.participation.options.address, giveQuantity).send(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas }
  );
  investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
  await updateTestingPriceFeed(deployed);
  receipt = await fund.participation.methods.requestInvestment(wantedShareQuantity, giveQuantity, ethToken.options.address).send(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice }
  );
  investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
  await updateTestingPriceFeed(deployed);
  await updateTestingPriceFeed(deployed);
  receipt = await fund.participation.methods.executeRequest().send(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice }
  );
  investorGasTotal = investorGasTotal.plus(receipt.gasUsed);
  const post = await getAllBalances(deployed, accounts, fund);
  const investorPostShares = Number(
    await fund.shares.methods.balanceOf(investor).call(),
  );

  t.is(investorPostShares, investorPreShares + wantedShareQuantity);
  t.true(post.investor.EthToken >= pre.investor.EthToken.minus(giveQuantity));
  t.deepEqual(
    post.investor.ether,
    pre.investor.ether.minus(investorGasTotal.times(gasPrice)),
  );
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.manager.ether, pre.manager.ether);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
  t.true(post.fund.EthToken <= pre.fund.EthToken.plus(giveQuantity));
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// Fees
test.serial("converts fees and manager receives them", async t => {
  await updateTestingPriceFeed(deployed);
  const pre = await getAllBalances(deployed, accounts, fund);
  const preManagerShares = new BigNumber(await fund.shares.methods.balanceOf(manager).call());
  const totalSupply = new BigNumber(await fund.shares.methods.totalSupply().call());
  receipt = await fund.accounting.methods.calcSharePriceAndAllocateFees().send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice }
  );
  const [gav, unclaimedFees, , ,] = Object.values(
    await fund.accounting.methods.performCalculations().call(),
  );
  const shareQuantity = Math.floor(
    Number(totalSupply.mul(unclaimedFees).div(gav)),
  );
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  const postManagerShares = new BigNumber(await fund.shares.methods.balanceOf(manager).call());
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(postManagerShares, preManagerShares.add(shareQuantity));
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

test.serial("manger opens new order, but not anyone can cancel", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await fund.trading.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", mlnToken.options.address, ethToken.options.address, "0x0"],
    [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  );
  const offerNumber = await exchanges[0].methods.last_offer_id().call();
  await t.throws(fund.trading.methods.callOnExchange(
    0,
    cancelOrderSignature,
    ["0x0", "0x0", mlnToken.options.address, "0x0", "0x0"],
    [0, 0, 0, 0, 0, 0, 0, 0],
    `0x${Number(offerNumber)
      .toString(16)
      .padStart(64, "0")}`,
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: accounts[3], gas: config.gas }
  ));
  const offerActive = await exchanges[0].methods.isActive(
    offerNumber,
  ).call();
  const post = await getAllBalances(deployed, accounts, fund);

  t.true(offerActive);
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.minus(trade1.sellQuantity));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken);
  t.deepEqual(post.fund.ether, pre.fund.ether);
});

// shutdown fund
test.serial("manager can shut down a fund", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  receipt = await fund.hub.methods.shutDownFund().send(
    { from: manager, gasPrice: config.gasPrice }
  );
  runningGasTotal = runningGasTotal.plus(receipt.gasUsed);
  const isShutDown = await fund.hub.methods.isShutDown().call();
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

test.serial("shutdown of fund allows anyone to cancel order", async t => {
  const offerNumber = await exchanges[0].methods.last_offer_id().call();
  receipt = await fund.trading.methods.callOnExchange(
    0,
    cancelOrderSignature,
    ["0x0", "0x0", mlnToken.options.address, "0x0", "0x0"],
    [0, 0, 0, 0, 0, 0, 0, 0],
    `0x${Number(offerNumber)
      .toString(16)
      .padStart(64, "0")}`,
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: accounts[3], gas: config.gas }
  );
  const offerActive = await exchanges[0].methods.isActive(
    offerNumber,
  ).call();

  t.false(offerActive);
});
