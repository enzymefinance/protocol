import * as fs from "fs";
import * as path from "path";
import * as masterConfig from "../config/environment";
import * as tokenInfo from "../info/tokenInfo";
import {deployContract, retrieveContract} from "../lib/contracts";
import {makeOrderSignature, takeOrderSignature, cancelOrderSignature, toBytes8, toBytes32, abiEncode} from "../lib/data";
import getFundComponents from "../lib/getFundComponents";
import {clone} from "../lib/misc";
import web3 from "../lib/web3";

const BigNumber = require("bignumber.js");

// Constants and mocks
const addressBookFile = "./addressBook.json";
const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";

async function deployEnvironment(environment) {
  const config = masterConfig[environment];
  const accounts = await web3.eth.getAccounts();
  const opts = {
    from: accounts[0],
    gas: 8000000,
    gasPrice: config.gasPrice,
  };
  const deployed = {};

  if (environment === "development") {
    console.log(`Deployer: ${accounts[0]}`);
    const quoteAsset = await deployContract("dependencies/PreminedToken", opts);
    const secondAsset = await deployContract("dependencies/PreminedToken", opts);
    const testingPriceFeed = await deployContract("prices/TestingPriceFeed", opts, [
      quoteAsset.options.address, 18
    ]);
    const matchingMarket = await deployContract("exchanges/MatchingMarket", opts, [99999999999]);
    // const newOpts = Object.assign({}, opts);
    await matchingMarket.methods.addTokenPairWhitelist(
      quoteAsset.options.address, secondAsset.options.address
    ).send(clone(opts));
    const priceTolerance = await deployContract('fund/risk-management/PriceTolerance', opts, [10])
    const whitelist = await deployContract('fund/compliance/Whitelist', opts, [[accounts[0]]])
    const matchingMarketAdapter = await deployContract("exchanges/MatchingMarketAdapter", opts);
    const accountingFactory = await deployContract("factory/AccountingFactory", opts);
    const feeManagerFactory = await deployContract("factory/FeeManagerFactory", opts);
    const participationFactory = await deployContract("factory/ParticipationFactory", opts);
    const sharesFactory = await deployContract("factory/SharesFactory", opts);
    const tradingFactory = await deployContract("factory/TradingFactory", opts);
    const vaultFactory = await deployContract("factory/VaultFactory", opts);
    const policyManagerFactory = await deployContract("factory/PolicyManagerFactory", opts);
    const fundFactory = await deployContract("factory/FundFactory", opts, [
      accountingFactory.options.address,
      feeManagerFactory.options.address,
      participationFactory.options.address,
      sharesFactory.options.address,
      tradingFactory.options.address,
      vaultFactory.options.address,
      policyManagerFactory.options.address
    ]);
    await fundFactory.methods.createComponents(
      [matchingMarket.options.address], [matchingMarketAdapter.options.address], [quoteAsset.options.address, secondAsset.options.address], [false], testingPriceFeed.options.address
    ).send(opts);
    await fundFactory.methods.continueCreation().send(opts);
    console.log('Components created');
    await fundFactory.methods.setupFund().send(opts);
    console.log('Fund set up');
    const hubAddress = await fundFactory.methods.getFundById(0).call();
    const fund = await getFundComponents(hubAddress);

    fund.policyManager.methods.register(makeOrderSignature, priceTolerance.options.address).send(Object(opts))
    fund.policyManager.methods.register(takeOrderSignature, priceTolerance.options.address).send(Object(opts))
    fund.policyManager.methods.register(abiEncode("executeRequestFor", ["address"]), whitelist.options.address).send(Object(opts))
    console.log('Policies registered');

    await testingPriceFeed.methods.update([quoteAsset.options.address],[10**18]).send(opts);
    await testingPriceFeed.methods.update([secondAsset.options.address],[10**18]).send(opts);
    // invest & redeem
    const amt = 10**18;
    await quoteAsset.methods.approve(fund.participation.options.address, amt).send(opts);
    await fund.participation.methods.requestInvestment(amt, amt, quoteAsset.options.address).send(opts);
    console.log('Investment requested');
    await fund.participation.methods.executeRequest().send(opts);
    let supply = await fund.shares.methods.totalSupply().call();
    console.log(`Supply after invest: ${supply}`);
    await fund.participation.methods.redeem().send(opts);
    supply = await fund.shares.methods.totalSupply().call();
    console.log(`Supply after redeem: ${supply}`);

    // invest and open order
    await quoteAsset.methods.approve(fund.participation.options.address, amt).send(opts);
    await fund.participation.methods.requestInvestment(amt, amt, quoteAsset.options.address).send(opts);
    await fund.participation.methods.executeRequest().send(opts);
    const exchange1 = await fund.trading.methods.exchanges(0).call();
    console.log(`Exchange: ${exchange1.exchange}`);
    const trade1 = {
      sellQuantity: new BigNumber(10 ** 18),
      buyQuantity: new BigNumber(10 ** 18),
    };
    await fund.trading.methods.callOnExchange(
      0,
      makeOrderSignature,
      ["0x0", "0x0", quoteAsset.options.address, secondAsset.options.address, "0x0"],
      [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
      web3.utils.padLeft('0x0', 64),
      0,
      web3.utils.padLeft('0x0', 64),
      web3.utils.padLeft('0x0', 64),
    ).send(clone(opts));
    console.log(`Amount on exchange: ${await quoteAsset.methods.balanceOf(matchingMarket.options.address).call()}`);
    console.log(`Amount in trading module: ${await quoteAsset.methods.balanceOf(fund.trading.options.address).call()}`);
    const orderId = 1;
    await fund.trading.methods.callOnExchange(
      0,
      cancelOrderSignature,
      ["0x0", "0x0", quoteAsset.options.address, secondAsset.options.address, "0x0"],
      [trade1.sellQuantity, trade1.buyQuantity, 0, 0, 0, 0, 0, 0],
      toBytes32(1),
      0,
      toBytes32(0),
      toBytes32(0)
    ).send(clone(opts));
    console.log(`Amount on exchange: ${await quoteAsset.methods.balanceOf(matchingMarket.options.address).call()}`);
    console.log(`Amount in trading module: ${await quoteAsset.methods.balanceOf(fund.trading.options.address).call()}`);

    console.log(await secondAsset.methods.balanceOf(accounts[0]).call())
    await secondAsset.methods.approve(matchingMarket.options.address, trade1.sellQuantity).send(opts);
    await matchingMarket.methods.make(
      secondAsset.options.address, quoteAsset.options.address,
      trade1.sellQuantity, trade1.buyQuantity
    ).send(clone(opts));
    console.log('order made by account');
    await fund.trading.methods.callOnExchange(
      0,
      takeOrderSignature,
      ["0x0", "0x0", quoteAsset.options.address, secondAsset.options.address, "0x0"],
      [0, 0, 0, 0, 0, 0, trade1.buyQuantity, 0],
      toBytes32(2),
      0,
      toBytes32(0),
      toBytes32(0)
    ).send(clone(opts));
    console.log('order taken by fund');
    console.log(`Quote asset in trading module: ${await quoteAsset.methods.balanceOf(fund.trading.options.address).call()}`);
    console.log(`Secondary asset in trading module: ${await secondAsset.methods.balanceOf(fund.trading.options.address).call()}`);
  }
  return deployed;
}

if (require.main === module) {
  const environment = process.env.CHAIN_ENV;
  if (environment === undefined) {
    throw new Error(`Please specify an environment using the environment variable CHAIN_ENV`);
  } else {
    deployEnvironment(environment)
      .catch(err => console.error(err.stack))
      .finally(() => process.exit())
  }
}

export default deployEnvironment;

