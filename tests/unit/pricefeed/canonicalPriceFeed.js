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
  return pricefeed.instance.registerAsset.postTransaction(opts, [
    eurToken.address,
    eurName,
    eurSymbol,
    eurDecimals,
    eurUrl,
    mockIpfs,
    mockBreakIn,
    mockBreakOut,
    [],
    []
  ]);
}

function registerEth(pricefeed) {
  return pricefeed.instance.registerAsset.postTransaction(opts, [
    ethToken.address,
    "Ethereum",
    "ETH",
    ethDecimals,
    "ethereum.org",
    mockIpfs,
    mockBreakIn,
    mockBreakOut,
    [],
    []
  ]);
}

function registerBtc(pricefeed) {
  return pricefeed.instance.registerAsset.postTransaction(opts, [
    mockBtcAddress,
    "Bitcoin",
    "BTC",
    btcDecimals,
    "bitcoin.org",
    mockIpfs,
    mockBreakIn,
    mockBreakOut,
    [],
    []
  ]);
}

async function createPriceFeedAndStake(context) {
  const feed = await deployContract("pricefeeds/StakingPriceFeed", { from: accounts[0] }, [
    context.canonicalPriceFeed.address,
    mlnToken.address,
    context.canonicalPriceFeed.address,
  ]);
  await feed.instance.depositStake.postTransaction(
    {from: accounts[0]}, [config.protocol.staking.minimumAmount, ""]
  );
  context.pricefeeds.push(feed);
}

function medianize(pricesArray) {
  const prices = pricesArray.sort();
  const len = prices.length;
  if (len % 2 === 0) {
    return prices[len / 2].add(prices[len / 2 - 1]).div(2);
  }
  return prices[(len - 1) / 2];
}

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
      mockBreakIn,
      mockBreakOut,
      [],
      [],
      [config.protocol.pricefeed.interval, config.protocol.pricefeed.validity],
      [config.protocol.staking.minimumAmount, config.protocol.staking.numOperators],
      accounts[0]
    ],
  );
  t.context.pricefeeds = [];
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
});

test("registers more than one asset without error", async t => {
  await registerEur(t.context.canonicalPriceFeed);
  await registerEth(t.context.canonicalPriceFeed);
  const eurRegistered = await t.context.canonicalPriceFeed.instance.assetIsRegistered.call({}, [eurToken.address]);
  const ethRegistered = await t.context.canonicalPriceFeed.instance.assetIsRegistered.call({}, [ethToken.address]);
  const mlnRegistered = await t.context.canonicalPriceFeed.instance.assetIsRegistered.call({}, [mlnToken.address]);
  let registeredAssets = await t.context.canonicalPriceFeed.instance.getRegisteredAssets.call();
  registeredAssets = registeredAssets.map(e => e._value);
  const allInRegistry =
    registeredAssets.includes(eurToken.address) &&
    registeredAssets.includes(ethToken.address) &&
    registeredAssets.includes(mlnToken.address)

  t.true(eurRegistered);
  t.true(ethRegistered);
  t.true(mlnRegistered); // MLN registered by default
  t.true(allInRegistry);
});

// TODO: do we need this test? may already be tested in staking tests
test.skip("Pricefeed gets added to whitelist correctly", async t => {
  const index1 = await t.context.canonicalPriceFeed.instance.getFeedWhitelistIndex.call(
    {},
    [t.context.pricefeeds[0].address],
  );
  const isWhitelisted1 = await t.context.canonicalPriceFeed.instance.isWhitelisted.call(
    {},
    [t.context.pricefeeds[0].address],
  );
  const index2 = await t.context.canonicalPriceFeed.instance.getFeedWhitelistIndex.call(
    {},
    [t.context.pricefeeds[1].address],
  );
  const isWhitelisted2 = await t.context.canonicalPriceFeed.instance.isWhitelisted.call(
    {},
    [t.context.pricefeeds[1].address],
  );
  t.is(Number(index1), 0);
  t.true(isWhitelisted1);
  t.is(Number(index2), 1);
  t.true(isWhitelisted2);
});

// TODO: do we need this test? may already be tested in staking tests
test.skip("Pricefeed gets removed from whitelist correctly", async t => {
  await t.context.canonicalPriceFeed.instance.removeFeedFromWhitelist.postTransaction(opts, [
    t.context.pricefeeds[1].address, 1
  ]);
  const feedIsWhitelisted = await t.context.canonicalPriceFeed.instance.isWhitelisted.call(
    {},
    [t.context.pricefeeds[1].address],
  );
  t.false(feedIsWhitelisted);
});

test("Subfeeds return price correctly", async t => {
  await registerEur(t.context.canonicalPriceFeed);
  await registerEth(t.context.canonicalPriceFeed);
  await registerBtc(t.context.canonicalPriceFeed);
  const inputPriceEur = 150000000;
  const inputPriceEth = 2905;
  const inputPriceBtc = 12000000000;
  await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address, ethToken.address, mockBtcAddress],
      [inputPriceEur, inputPriceEth, inputPriceBtc],
    ],
  );
  const [eurPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [eurToken.address]),
  );
  const [ethPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [ethToken.address]),
  );

  t.is(inputPriceEur, Number(eurPrice));
  t.is(inputPriceEth, Number(ethPrice));
});

/* eslint-disable no-await-in-loop */
test("Update price for even number of pricefeeds", async t => {
  const prices = [new BigNumber(10 ** 20), new BigNumber(2 * 10 ** 20)];
  await registerEur(t.context.canonicalPriceFeed);
  for (let i = 0; i < t.context.pricefeeds.length; i += 1) {
    await t.context.pricefeeds[i].instance.update.postTransaction(
      { from: accounts[0], gas: 6000000 },
      [[eurToken.address], [prices[i]]],
    );
  }
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [[eurToken.address]],
  );
  const [price, ] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPrice.call({}, [
      eurToken.address
    ]),
  );
  t.is(Number(price), Number(medianize(prices)));
});

test("Update price for odd number of pricefeeds", async t => {
  const prices = [
    new BigNumber(10 ** 20),
    new BigNumber(2 * 10 ** 20),
    new BigNumber(4 * 10 ** 20),
  ];
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context.canonicalPriceFeed);
  for (let i = 0; i < t.context.pricefeeds.length; i += 1) {
    await t.context.pricefeeds[i].instance.update.postTransaction(
      { from: accounts[0], gas: 6000000 },
      [[eurToken.address], [prices[i]]],
    );
  }
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [[eurToken.address]],
  );
  const [, price] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPriceInfo.call({}, [
      eurToken.address,
    ]),
  );

  t.deepEqual(price, medianize(prices));
});

test("governance cannot manually force a price update", async t => {
  await registerEur(t.context.canonicalPriceFeed);
  const preUpdateId = Number(await t.context.canonicalPriceFeed.instance.updateId.call());
  await t.context.canonicalPriceFeed.instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [[eurToken.address], [50000]]
  );
  const postUpdateId = Number(await t.context.canonicalPriceFeed.instance.updateId.call());

  t.is(preUpdateId, postUpdateId)
});
