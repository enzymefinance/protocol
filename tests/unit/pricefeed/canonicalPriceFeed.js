import test from "ava";
import api from "../../../utils/lib/api";
import { deployContract } from "../../../utils/lib/contracts";
import deployEnvironment from "../../../utils/deploy/contracts";

const environmentConfig = require("../../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = "development";
const config = environmentConfig[environment];
BigNumber.config({ DECIMAL_PLACES: 18 });

// hoisted variables
let eurToken;
let ethToken;
let mlnToken;
let accounts;
let opts;
let deployed;

// mock data
const mockBtcAddress = "0x0360E6384FEa0791e18151c531fe70da23c55fa2";
const mockIpfs = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const mockBytes =
  "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockBreakIn = "0x0360E6384FEa0791e18151c531fe70da23c55fa2";
const mockBreakOut = "0xc6Eb2A235627Ac97EAbc6452F98Ce296a1EF3984";
const eurName = "Euro Token";
const eurSymbol = "EUR-T";
const eurDecimals = 12; // For different decimal test
const eurUrl = "europa.eu";
const ethDecimals = 18;
const mlnDecimals = 18;
const btcDecimals = 8;

// helper functions
function registerEur(pricefeed) {
  return pricefeed.instance.register.postTransaction(opts, [
    eurToken.address,
    eurName,
    eurSymbol,
    eurDecimals,
    eurUrl,
    mockIpfs,
    mockBytes,
    mockBreakIn,
    mockBreakOut,
  ]);
}

function registerEth(pricefeed) {
  return pricefeed.instance.register.postTransaction(opts, [
    ethToken.address,
    "Ethereum",
    "ETH",
    ethDecimals,
    "ethereum.org",
    mockIpfs,
    mockBytes,
    mockBreakIn,
    mockBreakOut,
  ]);
}

function registerBtc(pricefeed) {
  return pricefeed.instance.register.postTransaction(opts, [
    mockBtcAddress,
    "Bitcoin",
    "BTC",
    btcDecimals,
    "bitcoin.org",
    mockIpfs,
    mockBytes,
    mockBreakIn,
    mockBreakOut,
  ]);
}

async function createAndWhitelistPriceFeed(context) {
  context.pricefeed.push(await deployContract(
    "pricefeeds/PriceFeed",
    { from: accounts[0] },
    [
      mlnToken.address,
      "Melon Token",
      "MLN-T",
      mlnDecimals,
      "melonport.com",
      mockBytes,
      mockBytes,
      mockBreakIn,
      mockBreakOut,
      config.protocol.pricefeed.interval,
      config.protocol.pricefeed.validity,
    ],
  ));
  context.canonicalPriceFeed.instance.addFeedToWhitelist.postTransaction(opts, [context.pricefeed[context.pricefeed.length - 1].address]);
}
function medianize(pricesArray) {
  const prices = pricesArray.sort();
  const len = prices.length;
  if (len % 2 === 0) {
    return (prices[len / 2].add(prices[(len / 2) - 1])).div(2);
  }
  return prices[(len - 1) / 2];
};

// hooks

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await api.eth.accounts();
  opts = { from: accounts[0], gas: config.gas };
  ethToken = await deployed.EthToken;
  eurToken = await deployed.EurToken;
  mlnToken = await deployed.MlnToken;
});

test.beforeEach(async t => {
  t.context.canonicalPriceFeed = await deployContract(
    "pricefeeds/CanonicalPriceFeed",
    { from: accounts[0] },
    [
      mlnToken.address,
      "Melon Token",
      "MLN-T",
      mlnDecimals,
      "melonport.com",
      mockBytes,
      mockBytes,
      mockBreakIn,
      mockBreakOut,
      config.protocol.pricefeed.interval,
      config.protocol.pricefeed.validity,
    ],
  );
  t.context.pricefeed = [];
  await createAndWhitelistPriceFeed(t.context);
  await createAndWhitelistPriceFeed(t.context);
});

// tests (concurrent)

test("registers more than one asset without error", async t => {
  await registerEur(t.context.pricefeed[0]);
  await registerEth(t.context.pricefeed[0]);
  const [
    ,
    ,
    ,
    ,
    eurRegistered,
  ] = await t.context.pricefeed[0].instance.information.call({}, [
    eurToken.address,
  ]);
  const [
    ,
    ,
    ,
    ,
    ethRegistered,
  ] = await t.context.pricefeed[0].instance.information.call({}, [
    ethToken.address,
  ]);
  const [
    ,
    ,
    ,
    ,
    mlnRegistered,
  ] = await t.context.pricefeed[0].instance.information.call({}, [
    mlnToken.address,
  ]);

  t.true(eurRegistered);
  t.true(ethRegistered);
  t.true(mlnRegistered); // MLN registered by default
});

test("Pricefeed gets added to whitelist correctly", async t => {
  const result = await t.context.canonicalPriceFeed.instance.getFeedWhitelistIndex.call({}, [
    t.context.pricefeed[0].address,
  ]);

  t.is(Number(result), 0);
});

test("Pricefeed gets removed from whitelist", async t => {
  await registerEur(t.context.pricefeed[0]);
  await registerEth(t.context.pricefeed[0]);
  await registerBtc(t.context.pricefeed[0]);
  const inputPriceEur = 150000000;
  const inputPriceEth = 2905;
  const inputPriceBtc = 12000000000;
  await t.context.pricefeed[0].instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address, ethToken.address, mockBtcAddress],
      [inputPriceEur, inputPriceEth, inputPriceBtc],
    ],
  );
  const [eurIsRecent, eurPrice, returnedEurDecimals] = Object.values(
    await t.context.pricefeed[0].instance.getPrice.call({}, [eurToken.address]),
  );
  const [ethIsRecent, ethPrice, returnedEthDecimals] = Object.values(
    await t.context.pricefeed[0].instance.getPrice.call({}, [ethToken.address]),
  );

  t.is(inputPriceEur, Number(eurPrice));
  t.true(eurIsRecent);
  t.is(eurDecimals, Number(returnedEurDecimals));
  t.is(inputPriceEth, Number(ethPrice));
  t.true(ethIsRecent);
  t.is(18, Number(returnedEthDecimals));
});

test("Update price for even number of pricefeeds", async t => {
  const prices = [new BigNumber(1000), new BigNumber(2000)];
  await registerEur(t.context.pricefeed[0]);
  await registerEur(t.context.pricefeed[1]);
  await registerEur(t.context.canonicalPriceFeed);
  await t.context.pricefeed[0].instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address],
      [prices[0]],
    ],
  );
  await t.context.pricefeed[1].instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address],
      [prices[1]],
    ],
  );
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address]
    ],
  );
  const [, price, ] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPriceInfo.call({}, [eurToken.address]),
  );
  t.deepEqual(price, medianize(prices));
});

test("Update price for odd number of pricefeeds", async t => {
  const prices = [new BigNumber(1000), new BigNumber(2000), new BigNumber(4000)];
  await createAndWhitelistPriceFeed(t.context);
  await registerEur(t.context.pricefeed[0]);
  await registerEur(t.context.pricefeed[1]);
  await registerEur(t.context.pricefeed[2]);
  await registerEur(t.context.canonicalPriceFeed);
  await t.context.pricefeed[0].instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address],
      [prices[0]],
    ],
  );
  await t.context.pricefeed[1].instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address],
      [prices[1]],
    ],
  );
  await t.context.pricefeed[2].instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address],
      [prices[2]],
    ],
  );
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address]
    ],
  );
  const [, price, ] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPriceInfo.call({}, [eurToken.address]),
  );
  t.deepEqual(price, medianize(prices));
});
