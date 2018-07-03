import test from "ava";
import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";
import deployEnvironment from "../../../utils/deploy/contracts";
import createStakingFeed from "../../../utils/lib/createStakingFeed";

const environmentConfig = require("../../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = "development";
const config = environmentConfig[environment];
BigNumber.config({ DECIMAL_PLACES: 18 });

// hoisted variables
let eurToken;
let ethToken;
let accounts;
let opts;
let deployed;

// mock data
const mockBtcAddress = "0x0360E6384FEa0791e18151c531fe70da23c55fa2";
const mockIpfs = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const mockBytes32 = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockBytes4 = "0x12345678"
const mockBreakIn = "0x0360E6384FEa0791e18151c531fe70da23c55fa2";
const mockBreakOut = "0xc6Eb2A235627Ac97EAbc6452F98Ce296a1EF3984";
const eurDecimals = 12; // For different decimal test
const ethDecimals = 18;
const mlnDecimals = 18;
const btcDecimals = 8;
const defaultMlnPrice = 10 ** 18;

// helper functions
function registerEur(pricefeed) {
  return pricefeed.methods.registerAsset(
    eurToken.options.address,
    web3.utils.padLeft(web3.utils.toHex('Euro Token'), 34),
    web3.utils.padLeft(web3.utils.toHex('EUR-T'), 34),
    eurDecimals,
    "europa.eu",
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send(opts);
}

function registerEth(pricefeed) {
  return pricefeed.methods.registerAsset(
    ethToken.options.address,
    web3.utils.padLeft(web3.utils.toHex('Ethereum'), 34),
    web3.utils.padLeft(web3.utils.toHex('ETH'), 34),
    ethDecimals,
    "ethereum.org",
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send(opts);
}

function registerBtc(pricefeed) {
  return pricefeed.methods.registerAsset(
    mockBtcAddress,
    web3.utils.padLeft(web3.utils.toHex('Bitcoin'), 34),
    web3.utils.padLeft(web3.utils.toHex('BTC'), 34),
    btcDecimals,
    "bitcoin.org",
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send(opts);
}
//
// hex to ascii string, stripping extra zereoes in case of fixed length bytes
function hexToAsciiStrip(hexString) {
  return web3.utils.hexToAscii(hexString.replace(/0+$/, ""));
}

async function createPriceFeedAndStake(context) {
  const stakingFeed = await createStakingFeed({...opts}, context.canonicalPriceFeed);
  await context.mlnToken.methods.approve(stakingFeed.options.address, config.protocol.staking.minimumAmount).send(opts);
  await stakingFeed.methods.depositStake(config.protocol.staking.minimumAmount, web3.utils.asciiToHex("")).send(opts);
  context.pricefeeds.push(stakingFeed);
}

function medianize(pricesArray) {
  let prices = pricesArray.filter(e => {
    if (e === 0) { return false; }
    return true;
  });
  prices = prices.sort();
  const len = prices.length;
  if (len % 2 === 0) {
    return prices[len / 2].add(prices[len / 2 - 1]).div(2);
  }
  return prices[(len - 1) / 2];
}

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  opts = { from: accounts[0], gas: config.gas };
  ethToken = await deployed.EthToken;
  eurToken = await deployed.EurToken;
});

test.beforeEach(async t => {
  t.context.mlnToken = await deployContract("assets/PreminedAsset", opts);
  t.context.canonicalPriceFeed = await deployContract(
    "pricefeeds/CanonicalPriceFeed",
    opts,
    [
      t.context.mlnToken.options.address,
      t.context.mlnToken.options.address,
      web3.utils.padLeft(web3.utils.toHex('MLN token'), 34),
      web3.utils.padLeft(web3.utils.toHex('MLN-T'), 34),
      mlnDecimals,
      web3.utils.padLeft(web3.utils.toHex("melonport.com"), 34),
      mockBytes32,
      [mockBreakIn, mockBreakOut],
      [],
      [],
      [
        config.protocol.pricefeed.interval,
        config.protocol.pricefeed.validity
      ],
      [
        config.protocol.staking.minimumAmount,
        config.protocol.staking.numOperators,
        config.protocol.staking.unstakeDelay
      ],
      accounts[0]
    ], () => {}, true
  );
  t.context.pricefeeds = [];
});

test("can register assets, as well as update and remove them", async t => {
  await registerEth(t.context.canonicalPriceFeed);
  await registerEur(t.context.canonicalPriceFeed);
  const eurRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(eurToken.options.address).call();
  const ethRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(ethToken.options.address).call();
  const mlnRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(t.context.mlnToken.options.address).call();
  const registeredAssets = await t.context.canonicalPriceFeed.methods.getRegisteredAssets().call();
  const allInRegistry =
    registeredAssets.includes(eurToken.options.address) &&
    registeredAssets.includes(ethToken.options.address) &&
    registeredAssets.includes(t.context.mlnToken.options.address)

  t.true(eurRegistered);
  t.true(ethRegistered);
  t.true(mlnRegistered); // MLN registered by default
  t.true(allInRegistry);

  await t.context.canonicalPriceFeed.methods.updateAsset(
    eurToken.options.address,
    web3.utils.asciiToHex('New name'),
    web3.utils.asciiToHex('NEW'),
    12,
    web3.utils.asciiToHex("europa.eu"),
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send(opts);
  const updatedInfo = await t.context.canonicalPriceFeed.methods.assetInformation(eurToken.options.address).call();

  t.is(hexToAsciiStrip(updatedInfo[1]), "New name");
  t.is(hexToAsciiStrip(updatedInfo[2]), "NEW");
  t.is(Number(updatedInfo[3]), 12);

  await t.context.canonicalPriceFeed.methods.removeAsset(eurToken.options.address, 1).send(opts);
  const eurRegisteredPostRemoval = await t.context.canonicalPriceFeed.methods.assetIsRegistered(eurToken.options.address).call();

  t.false(eurRegisteredPostRemoval);
});

test("can register exchanges, as well as update and remove them", async t => {
  await t.context.canonicalPriceFeed.methods.registerExchange(
    deployed.MatchingMarket.options.address,
    deployed.MatchingMarketAdapter.options.address,
    true,
    [mockBytes4]
  ).send(opts);
  await t.context.canonicalPriceFeed.methods.registerExchange(
    deployed.SimpleMarket.options.address,
    deployed.SimpleAdapter.options.address,
    false,
    [mockBytes4]
  ).send(opts);

  const matchingMarketRegistered = await t.context.canonicalPriceFeed.methods.exchangeIsRegistered(deployed.MatchingMarket.options.address).call();
  const simpleMarketRegistered = await t.context.canonicalPriceFeed.methods.exchangeIsRegistered(deployed.SimpleMarket.options.address).call();
  const registeredExchanges = await t.context.canonicalPriceFeed.methods.getRegisteredExchanges().call();
  const allExchangesInRegistry =
    registeredExchanges.includes(deployed.MatchingMarket.options.address) &&
    registeredExchanges.includes(deployed.SimpleMarket.options.address)

  t.true(matchingMarketRegistered);
  t.true(simpleMarketRegistered);
  t.true(allExchangesInRegistry);

  await t.context.canonicalPriceFeed.methods.updateExchange(
    deployed.MatchingMarket.options.address,
    deployed.SimpleAdapter.options.address,
    false,
    []
  ).send(opts);
  const updatedInfo = await t.context.canonicalPriceFeed.methods.exchangeInformation(deployed.MatchingMarket.options.address).call();
  const functionAllowedPostUpdate = await t.context.canonicalPriceFeed.methods.exchangeMethodIsAllowed(deployed.MatchingMarket.options.address, mockBytes4).call();

  t.is(updatedInfo[1], deployed.SimpleAdapter.options.address);
  t.false(updatedInfo[2]);
  t.false(functionAllowedPostUpdate);

  await t.context.canonicalPriceFeed.methods.removeExchange(
    deployed.MatchingMarket.options.address, 0
  ).send(opts);
  const matchingMarketRegisteredPostRemoval = await t.context.canonicalPriceFeed.methods.exchangeIsRegistered(deployed.MatchingMarket.options.address).call();

  t.false(matchingMarketRegisteredPostRemoval);
});

test("staked pricefeed gets price accounted for, but does not count when unstaked", async t => {
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context.canonicalPriceFeed);
  const firstPrice = 150000000;
  await t.context.pricefeeds[0].methods.update(
    [t.context.mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, firstPrice]
  ).send(opts);
  await t.context.canonicalPriceFeed.methods.collectAndUpdate([t.context.mlnToken.options.address, eurToken.options.address]).send(opts);
  const isOperatorWhileStaked = await t.context.canonicalPriceFeed.methods.isOperator(
    t.context.pricefeeds[0].options.address
  ).call();
  const [subfeedPriceStaked, ] = Object.values(await t.context.pricefeeds[0].methods.getPrice(
    eurToken.options.address
  ).call());
  const [canonicalPriceStaked, ] = Object.values(await t.context.canonicalPriceFeed.methods.getPrice(
    eurToken.options.address
  ).call());

  t.true(isOperatorWhileStaked);
  t.is(firstPrice, Number(subfeedPriceStaked));
  t.is(firstPrice, Number(canonicalPriceStaked));
  await t.context.pricefeeds[0].methods.unstake(
    config.protocol.staking.minimumAmount, web3.utils.asciiToHex("")
  ).send(opts);
  const isOperatorAfterUnstaked = await t.context.canonicalPriceFeed.methods.isOperator(
    t.context.pricefeeds[0].options.address
  ).call();
  await t.context.pricefeeds[0].methods.update(
    [t.context.mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, firstPrice]
  ).send(opts); // tx expected to fail, since no longer an operator. This means no price is updated.
  const [subfeedPriceUnstaked, ] = Object.values(await t.context.pricefeeds[0].methods.getPrice(
    eurToken.options.address
  ).call());
  const [canonicalPriceUnstaked, ] = Object.values(await t.context.canonicalPriceFeed.methods.getPrice(
    eurToken.options.address
  ).call());
  t.false(isOperatorAfterUnstaked);
  t.is(firstPrice, Number(subfeedPriceUnstaked));
  t.is(firstPrice, Number(canonicalPriceUnstaked));
});

test("subfeed returns price correctly", async t => {
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context.canonicalPriceFeed);
  await registerEth(t.context.canonicalPriceFeed);
  await registerBtc(t.context.canonicalPriceFeed);
  const inputPriceEur = 150000000;
  const inputPriceEth = 2905;
  const inputPriceBtc = 12000000000;
  await t.context.pricefeeds[0].methods.update(
    [t.context.mlnToken.options.address, eurToken.options.address, ethToken.options.address, mockBtcAddress],
    [defaultMlnPrice, inputPriceEur, inputPriceEth, inputPriceBtc],
  ).send(opts);
  const [eurPrice, ] = Object.values(
    await t.context.pricefeeds[0].methods.getPrice(eurToken.options.address).call()
  );
  const [ethPrice, ] = Object.values(
    await t.context.pricefeeds[0].methods.getPrice(ethToken.options.address).call()
  );
  const [btcPrice, ] = Object.values(
    await t.context.pricefeeds[0].methods.getPrice(mockBtcAddress).call()
  );
  const [mlnPrice, ] = Object.values(
    await t.context.pricefeeds[0].methods.getPrice(t.context.mlnToken.options.address).call()
  );

  t.is(inputPriceEur, Number(eurPrice));
  t.is(inputPriceEth, Number(ethPrice));
  t.is(inputPriceBtc, Number(btcPrice));
  t.is(defaultMlnPrice, Number(mlnPrice));
});

/* eslint-disable no-await-in-loop */
test("update price for even number of pricefeeds", async t => {
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
  const prices = [new BigNumber(10 ** 20), new BigNumber(2 * 10 ** 20)];
  await registerEur(t.context.canonicalPriceFeed);
  for (let i = 0; i < t.context.pricefeeds.length; i += 1) {
    await t.context.pricefeeds[i].methods.update(
      [t.context.mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, prices[i]],
    ).send(opts);
  }
  await t.context.canonicalPriceFeed.methods.collectAndUpdate([t.context.mlnToken.options.address, eurToken.options.address]).send(opts);
  let ownedFeeds = await t.context.canonicalPriceFeed.methods.getPriceFeedsByOwner(accounts[0]).call();
  const [price, ] = Object.values(
    await t.context.canonicalPriceFeed.methods.getPrice(
      eurToken.options.address
    ).call()
  );
  ownedFeeds = ownedFeeds.sort();
  const feedAddresses = t.context.pricefeeds.map(e => e.options.address).sort();

  t.is(Number(price), Number(medianize(prices)));
  t.deepEqual(ownedFeeds, feedAddresses);
});

test("update price for odd number of pricefeeds", async t => {
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
  const prices = [
    new BigNumber(10 ** 20),
    new BigNumber(2 * 10 ** 20),
    new BigNumber(4 * 10 ** 20),
  ];
  await registerEur(t.context.canonicalPriceFeed);
  for (let i = 0; i < t.context.pricefeeds.length; i += 1) {
    await t.context.pricefeeds[i].methods.update(
      [t.context.mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, prices[i]],
    ).send(opts);
  }
  await t.context.canonicalPriceFeed.methods.collectAndUpdate([t.context.mlnToken.options.address, eurToken.options.address]).send(opts);
  let ownedFeeds = await t.context.canonicalPriceFeed.methods.getPriceFeedsByOwner(accounts[0]).call();
  const [, price] = Object.values(
    await t.context.canonicalPriceFeed.methods.getPriceInfo(eurToken.options.address).call()
  );
  ownedFeeds = ownedFeeds.sort();
  const feedAddresses = t.context.pricefeeds.map(e => e.options.address).sort();

  t.deepEqual(new BigNumber(price), medianize(prices));
  t.deepEqual(ownedFeeds, feedAddresses);
});

test("canonical feed gets price when minimum number of feeds updated, but not all", async t => {
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context.canonicalPriceFeed);

  const priceScenarios = [
    [
      new BigNumber(1 * 10 ** 20), // incomplete set; smallest, mid, largest
      new BigNumber(2 * 10 ** 20),
      new BigNumber(4 * 10 ** 20),
    ], [
      new BigNumber(4 * 10 ** 20), // incomplete set; largest, mid, smallest
      new BigNumber(1 * 10 ** 20),
      new BigNumber(2 * 10 ** 20),
    ], [
      new BigNumber(2 * 10 ** 20), // incomplete set; mid, smallest, largest
      new BigNumber(1 * 10 ** 20),
      new BigNumber(4 * 10 ** 20),
    ], [
      new BigNumber(2 * 10 ** 20), // incomplete set; mid, largest, smallest
      new BigNumber(4 * 10 ** 20),
      new BigNumber(1 * 10 ** 20),
    ], [
      new BigNumber(1 * 10 ** 20), // complete set; sorted order
      new BigNumber(2 * 10 ** 20),
      new BigNumber(3 * 10 ** 20),
      new BigNumber(4 * 10 ** 20),
    ], [
      new BigNumber(4 * 10 ** 20), // complete set; reverse sorted order
      new BigNumber(3 * 10 ** 20),
      new BigNumber(2 * 10 ** 20),
      new BigNumber(1 * 10 ** 20),
    ], [
      new BigNumber(2 * 10 ** 20), // complete set; out of order 1
      new BigNumber(4 * 10 ** 20),
      new BigNumber(1 * 10 ** 20),
      new BigNumber(3 * 10 ** 20),
    ], [
      new BigNumber(4 * 10 ** 20), // complete set; out of order 2
      new BigNumber(2 * 10 ** 20),
      new BigNumber(1 * 10 ** 20),
      new BigNumber(3 * 10 ** 20),
    ]
  ];

  /* eslint no-restricted-syntax: ["error", "for"] */
  for (const prices of priceScenarios) {
    for (const [i, price] of prices.entries()) { // will only update to length of `prices`
      await t.context.pricefeeds[i].methods.update(
        [t.context.mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, price]
      ).send(opts);
    }
    await t.context.canonicalPriceFeed.methods.collectAndUpdate([t.context.mlnToken.options.address, eurToken.options.address]).send(opts);
    const operators = (await t.context.canonicalPriceFeed.methods.getOperators().call());
    const [canonicalPrice, ] = Object.values(await t.context.canonicalPriceFeed.methods.getPrice(eurToken.options.address).call());

    t.is(Number(canonicalPrice), Number(medianize(prices)));
    t.deepEqual(operators.sort(), t.context.pricefeeds.map(e => e.options.address).sort());
  }
});

// Governance assumed to be accounts[0]
test("governance cannot manually force a price update", async t => {
  await registerEur(t.context.canonicalPriceFeed);
  const preUpdateId = Number(await t.context.canonicalPriceFeed.methods.updateId().call());
  await t.throws(t.context.canonicalPriceFeed.methods.update(
    [eurToken.options.address], [50000]
  ).send(opts));
  const postUpdateId = Number(await t.context.canonicalPriceFeed.methods.updateId().call());

  t.is(preUpdateId, postUpdateId)
});

test("governance can burn stake of an operator", async t => {
  await createPriceFeedAndStake(t.context);
  const stakingFeedAddress = t.context.pricefeeds[0].options.address;
  const isOperatorBefore = await t.context.canonicalPriceFeed.methods.isOperator(stakingFeedAddress).call();
  const stakedAmountBefore = await t.context.canonicalPriceFeed.methods.totalStakedFor(stakingFeedAddress).call();
  await t.context.canonicalPriceFeed.methods.burnStake(
    stakingFeedAddress
  ).send(opts);
  const isOperatorAfter = await t.context.canonicalPriceFeed.methods.isOperator(
    stakingFeedAddress
  ).call();
  const stakedAmountAfter = await t.context.canonicalPriceFeed.methods.totalStakedFor(
    stakingFeedAddress
  ).call();
  t.is(Number(stakedAmountBefore), config.protocol.staking.minimumAmount)
  t.is(Number(stakedAmountAfter), 0)
  t.true(isOperatorBefore);
  t.false(isOperatorAfter);
});

test("only governance is allowed to call burnStake", async t => {
  await createPriceFeedAndStake(t.context);
  const stakingFeedAddress = t.context.pricefeeds[0].options.address;
  const isOperatorBefore = await t.context.canonicalPriceFeed.methods.isOperator(t.context.pricefeeds[0].options.address).call();
  const stakedAmountBefore = await t.context.canonicalPriceFeed.methods.totalStakedFor(stakingFeedAddress).call();
  await t.throws(t.context.canonicalPriceFeed.methods.burnStake(
    stakingFeedAddress
  ).send({from: accounts[1], gas: 6000000}));
  const isOperatorAfter = await t.context.canonicalPriceFeed.methods.isOperator(
    stakingFeedAddress
  ).call();
  const stakedAmountAfter = await t.context.canonicalPriceFeed.methods.totalStakedFor(stakingFeedAddress).call();
  t.deepEqual(stakedAmountAfter, stakedAmountBefore);
  t.true(isOperatorBefore);
  t.true(isOperatorAfter);
});
