import 'babel-polyfill';
import test from "ava";
import {
  assetDataUtils,
  orderHashUtils,
  signatureUtils,
  SignerType
} from "0x.js";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import getFundComponents from "../../utils/lib/getFundComponents";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { updateTestingPriceFeed } from "../../utils/lib/updatePriceFeed";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import getChainTime from "../../utils/lib/getChainTime";
import governanceAction from "../../utils/lib/governanceAction";
import {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
  makeOrderSignatureBytes,
  takeOrderSignatureBytes,
  cancelOrderSignatureBytes,
} from "../../utils/lib/data";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let ethToken;
let mlnToken;
let eurToken;
let zrxToken;
let mlnTokenWrapper; 
let eurTokenWrapper;
let ethfinexExchange;
let erc20Proxy;
let wrapperRegistry;
let fund;
let investor;
let manager;
let pricefeed;
let trade1;
let version;
let deployed;
let order;
let orderSignature;
let opts;

// mock data
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
const offeredValue = new BigNumber(10 ** 18);
const wantedShares = new BigNumber(10 ** 18);

test.before(async t => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor, ,] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployed.Version;
  pricefeed = await deployed.TestingPriceFeed;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  eurToken = await deployed.EurToken;
  zrxToken = await deployContract(
    "exchanges/thirdparty/0x/ZrxToken",
     opts 
  );
  ethfinexExchange = await deployContract(
    "exchanges/thirdparty/ethfinex/ExchangeEfx", opts
  );
  erc20Proxy = await deployContract(
    "exchanges/thirdparty/0x/ERC20Proxy", opts
  );
  const ethfinexAdapter = await deployContract(
    "exchanges/EthfinexAdapter",
    opts
  );
  mlnTokenWrapper = await deployContract(
    "exchanges/thirdparty/ethfinex/Wrapperlock",
    opts,
    [mlnToken.options.address, "MLN", "Melon", 18, false, ethfinexExchange.options.address, erc20Proxy.options.address]
  );
  eurTokenWrapper = await deployContract(
    "exchanges/thirdparty/ethfinex/Wrapperlock",
    opts,
    [eurToken.options.address, "EUR", "Euro Token", 18, false, ethfinexExchange.options.address, erc20Proxy.options.address]
  );

  // TODO
  // await governanceAction(
  //   opts,
  //   deployed.Governance,
  //   deployed.CanonicalPriceFeed,
  //   "registerExchange",
  //   [
  //     ethfinexExchange.options.address,
  //     ethfinexAdapter.options.address,
  //     false,
  //     [makeOrderSignature, takeOrderSignature, cancelOrderSignature]
  //   ]
  // );
  
  // Setup exchange
  await erc20Proxy.methods.addAuthorizedAddress(ethfinexExchange.options.address).send(opts);
  await ethfinexExchange.methods.registerAssetProxy(erc20Proxy.options.address).send(opts);
  const zrxAssetData = assetDataUtils.encodeERC20AssetData(zrxToken.options.address);
  await ethfinexExchange.methods.changeZRXAssetData(zrxAssetData).send(opts);
  await ethfinexExchange.methods.addNewWrapperPair(
    [mlnToken.options.address, eurToken.options.address], 
    [mlnTokenWrapper.options.address, eurTokenWrapper.options.address]
  ).send(opts);

  // Setup Fund
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await deployed.FundFactory.methods.createComponents(
    'Test Fund', 
    [ethfinexExchange.options.address], 
    [ethfinexAdapter.options.address], 
    deployed.EthToken.options.address, 
    [deployed.EthToken.options.address, deployed.MlnToken.options.address], 
    [true], 
    deployed.TestingPriceFeed.options.address
  ).send({from: manager, gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.continueCreation().send({from: manager, gasPrice: config.gasPrice});
  await deployed.FundFactory.methods.setupFund().send({from: manager, gasPrice: config.gasPrice});
  const fundId = await deployed.FundFactory.methods.getLastFundId().call();
  const hubAddress = await deployed.FundFactory.methods.getFundById(fundId).call();
  fund = await getFundComponents(hubAddress);
  await Promise.all(Object.values(fund).map(async (component) => {
    await deployed.MockVersion.methods.setIsFund(component.options.address).send({from: manager});
  }));

  const priceTolerance = await deployContract('fund/risk-management/PriceTolerance', { from: manager, gas: config.gas, gasPrice: config.gasPrice }, [10])
  await t.notThrows(fund.policyManager.methods.register(makeOrderSignatureBytes, priceTolerance.options.address).send({ from: manager, gasPrice: config.gasPrice }));
  await t.notThrows(fund.policyManager.methods.register(takeOrderSignatureBytes, priceTolerance.options.address).send({ from: deployer, gasPrice: config.gasPrice }));
});

test.beforeEach(async () => {
  await updateTestingPriceFeed(deployed);
  const [, referencePrice] = Object.values(
    await pricefeed.methods
      .getReferencePriceInfo(mlnToken.options.address, ethToken.options.address)
      .call()
  );
  const sellQuantity1 = new BigNumber(10 ** 18);
  trade1 = {
    sellQuantity: sellQuantity1,
    buyQuantity: new BigNumber(referencePrice)
      .dividedBy(new BigNumber(10 ** 18))
      .times(sellQuantity1)
  };
});

const initialTokenAmount = new BigNumber(10 ** 18);
test.serial("investor gets initial mlnToken for testing)", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await ethToken.methods
    .transfer(investor, initialTokenAmount.toFixed())
    .send({ from: deployer, gasPrice: config.gasPrice });
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.EthToken,
    new BigNumber(pre.investor.EthToken).add(initialTokenAmount)
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

test.serial(
  "fund receives ETH from investment, and gets ZRX from direct transfer",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await ethToken.methods
      .approve(fund.participation.options.address, offeredValue.toFixed())
      .send({ from: investor, gasPrice: config.gasPrice, gas: config.gas });
    await fund.participation.methods.requestInvestment(offeredValue.toFixed(), wantedShares.toFixed(), ethToken.options.address)
      .send({ from: investor, gas: config.gas, gasPrice: config.gasPrice });
    await fund.participation.methods.executeRequest().send({from: investor, gas: 6000000, gasPrice: config.gasPrice});
    await zrxToken.methods
      .transfer(investor, initialTokenAmount.toFixed())
      .send({ from: deployer, gasPrice: config.gasPrice });
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(post.worker.MlnToken, pre.worker.MlnToken);
    t.deepEqual(post.worker.EthToken, pre.worker.EthToken);
    t.deepEqual(
      post.investor.EthToken,
      pre.investor.EthToken.minus(offeredValue.toFixed())
    );
    t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
    t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
    t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
    t.deepEqual(post.manager.ether, pre.manager.ether);
    t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken);
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(offeredValue.toFixed()));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  }
);

test.serial("Make order through the fund", async t => {
  await mlnToken.methods
    .transfer(fund.vault.options.address, trade1.sellQuantity.toFixed())
    .send({ from: deployer, gasPrice: config.gasPrice });
  const makerAddress = fund.trading.options.address.toLowerCase();
  order = {
    exchangeAddress: ethfinexExchange.options.address.toLowerCase(),
    makerAddress,
    takerAddress: NULL_ADDRESS,
    senderAddress: NULL_ADDRESS,
    feeRecipientAddress: NULL_ADDRESS,
    expirationTimeSeconds: new BigNumber(await getChainTime()).add(
      20000
    ),
    salt: new BigNumber(555),
    makerAssetAmount: new BigNumber(trade1.sellQuantity),
    takerAssetAmount: new BigNumber(trade1.buyQuantity),
    makerAssetData: assetDataUtils.encodeERC20AssetData(
      mlnTokenWrapper.options.address.toLowerCase()
    ),
    takerAssetData: assetDataUtils.encodeERC20AssetData(
      ethToken.options.address.toLowerCase()
    ),
    makerFee: new BigNumber(0),
    takerFee: new BigNumber(0)
  };
  const orderHashHex = orderHashUtils.getOrderHashHex(order);
  orderSignature = await signatureUtils.ecSignOrderHashAsync(
    web3.currentProvider,
    orderHashHex,
    manager,
    SignerType.Default
  );
  orderSignature = orderSignature.substring(0, orderSignature.length - 1) + "6";
  console.log(await fund.accounting.methods.getFundHoldings().call());
  const preGav = await fund.accounting.methods.calcGav().call();
  const isValidSignatureBeforeMake = await ethfinexExchange.methods.isValidSignature(orderHashHex, fund.trading.options.address, orderSignature).call();
  await fund.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        makerAddress,
        NULL_ADDRESS,
        mlnToken.options.address,
        ethToken.options.address,
        order.feeRecipientAddress,
        NULL_ADDRESS
      ],
      [
        order.makerAssetAmount.toFixed(),
        order.takerAssetAmount.toFixed(),
        order.makerFee.toFixed(),
        order.takerFee.toFixed(),
        order.expirationTimeSeconds.toFixed(),
        order.salt.toFixed(),
        0,
        0
      ],
      web3.utils.padLeft("0x0", 64),
      order.makerAssetData,
      order.takerAssetData,
      orderSignature
    )
    .send({ from: manager, gas: config.gas });
  const postGav = await fund.accounting.methods.calcGav().call();
  const isValidSignatureAfterMake = await ethfinexExchange.methods.isValidSignature(orderHashHex, fund.trading.options.address, orderSignature).call();
  t.false(isValidSignatureBeforeMake);
  t.true(isValidSignatureAfterMake);
  console.log(await fund.accounting.methods.getFundHoldings().call());
  t.is(preGav, postGav);
  await web3.evm.increaseTime(1000);
});

test.serial(
    "Fund can cancel the order using just the orderId",
    async t => {
    //   await web3.evm.increaseTime(30000);
      const preGav = await fund.accounting.methods.calcGav().call();
      const orderHashHex = orderHashUtils.getOrderHashHex(order);
      await fund.trading.methods
        .callOnExchange(
          0,
          cancelOrderSignature,
          [
            NULL_ADDRESS,
            NULL_ADDRESS,
            NULL_ADDRESS,
            NULL_ADDRESS,
            NULL_ADDRESS,
            NULL_ADDRESS
          ],
          [0, 0, 0, 0, 0, 0, 0, 0],
          orderHashHex,
          "0x0",
          "0x0",
          "0x0"
        )
        .send({ from: manager, gas: config.gas });
      const postGav = await fund.accounting.methods.calcGav().call();
      const isOrderCancelled = await ethfinexExchange.methods.cancelled(orderHashHex).call();
      const makerAssetAllowance = new BigNumber(
        await mlnToken.methods
          .allowance(fund.trading.options.address, erc20Proxy.options.address)
          .call()
      );
      t.true(isOrderCancelled);
      t.is(preGav, postGav);
      t.deepEqual(makerAssetAllowance, new BigNumber(0));
    }
  );