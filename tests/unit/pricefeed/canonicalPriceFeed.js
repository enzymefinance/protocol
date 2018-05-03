import test from "ava";
import api from "../../../utils/lib/api";
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
    [mockBreakIn, mockBreakOut],
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
    [mockBreakIn, mockBreakOut],
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
    [mockBreakIn, mockBreakOut],
    [],
    []
  ]);
}

async function createPriceFeedAndStake(context) {
  const stakingFeed = await createStakingFeed(opts, context.canonicalPriceFeed);
  await mlnToken.instance.approve.postTransaction(
    {from: accounts[0]}, [stakingFeed.address, config.protocol.staking.minimumAmount]
  );
  await stakingFeed.instance.depositStake.postTransaction(
    {from: accounts[0]}, [config.protocol.staking.minimumAmount, ""]
  );
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
  accounts = await api.eth.accounts();
  opts = { from: accounts[0], gas: config.gas };
  ethToken = await deployed.EthToken;
  eurToken = await deployed.EurToken;
  mlnToken = await deployed.MlnToken;
});

test.beforeEach(async t => {
  t.context.canonicalPriceFeed = await deployContract(
    "pricefeeds/CanonicalPriceFeed",
    { from: accounts[0], gas: 6900000 },
    [
      mlnToken.address,
      mlnToken.address,
      "Melon Token",
      "MLN-T",
      mlnDecimals,
      "melonport.com",
      mockBytes,
      [mockBreakIn, mockBreakOut],
      [],
      [],
      [config.protocol.pricefeed.interval, config.protocol.pricefeed.validity],
      [config.protocol.staking.minimumAmount, config.protocol.staking.numOperators],
      accounts[0]
    ], () => {}, true
  );
  t.context.pricefeeds = [];
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

test("staked pricefeed gets price accounted for, but does not count when unstaked", async t => {
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context.canonicalPriceFeed);
  const firstPrice = 150000000;
  const secondPrice = 20000000000;
  await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0]}, [[eurToken.address], [firstPrice]]
  );
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(
    { from: accounts[0]}, [[eurToken.address]]
  );
  const isOperatorWhileStaked = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [t.context.pricefeeds[0].address]
  );
  const [subfeedPriceStaked, ] = await t.context.pricefeeds[0].instance.getPrice.call(
    {from: accounts[0]}, [eurToken.address]
  );
  const [canonicalPriceStaked, ] = await t.context.canonicalPriceFeed.instance.getPrice.call(
    {from: accounts[0]}, [eurToken.address]
  );

  t.true(isOperatorWhileStaked);
  t.is(firstPrice, Number(subfeedPriceStaked));
  t.is(firstPrice, Number(canonicalPriceStaked));

  await t.context.pricefeeds[0].instance.withdrawStake.postTransaction(
    {from: accounts[0]}, [config.protocol.staking.minimumAmount, ""]
  );
  await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0]}, [[eurToken.address], [secondPrice]]
  );
  const isOperatorAfterUnstaked = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [t.context.pricefeeds[0].address]
  );
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(
    { from: accounts[0]}, [[eurToken.address]]
  );    // this tx should fail, since no valid feeds to provide information
  const [subfeedPriceUnstaked, ] = await t.context.pricefeeds[0].instance.getPrice.call(
    {from: accounts[0]}, [eurToken.address]
  );
  const [canonicalPriceUnstaked, ] = await t.context.canonicalPriceFeed.instance.getPrice.call(
    {from: accounts[0]}, [eurToken.address]
  );

  t.false(isOperatorAfterUnstaked);
  t.is(secondPrice, Number(subfeedPriceUnstaked));
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
test("update price for even number of pricefeeds", async t => {
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
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
  let ownedFeeds = await t.context.canonicalPriceFeed.instance.getPriceFeedsByOwner.call({}, [accounts[0]]);
  const [price, ] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPrice.call({}, [
      eurToken.address
    ]),
  );
  ownedFeeds = ownedFeeds.map(e => e._value).sort();
  const feedAddresses = t.context.pricefeeds.map(e => e.address).sort();

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
    await t.context.pricefeeds[i].instance.update.postTransaction(
      { from: accounts[0], gas: 6000000 },
      [[eurToken.address], [prices[i]]],
    );
  }
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [[eurToken.address]],
  );
  let ownedFeeds = await t.context.canonicalPriceFeed.instance.getPriceFeedsByOwner.call({}, [accounts[0]]);
  const [, price] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPriceInfo.call({}, [
      eurToken.address,
    ]),
  );
  ownedFeeds = ownedFeeds.map(e => e._value).sort();
  const feedAddresses = t.context.pricefeeds.map(e => e.address).sort();

  t.deepEqual(price, medianize(prices));
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
      await t.context.pricefeeds[i].instance.update.postTransaction(
        { from: accounts[0] }, [[eurToken.address], [price]],
      );
    }
    await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(
      { from: accounts[0], gas: 6000000 },
      [[eurToken.address]]
    );
    const operators = (await t.context.canonicalPriceFeed.instance.getOperators.call()).map(e => e._value);
    const [canonicalPrice, ] = await t.context.canonicalPriceFeed.instance.getPrice.call({}, [eurToken.address]);

    t.is(Number(canonicalPrice), Number(medianize(prices)));
    t.deepEqual(operators.sort(), t.context.pricefeeds.map(e => e.address).sort());
  }
});

// Governance assumed to be accounts[0]
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

test("governance can burn stake of an operator", async t => {
  await createPriceFeedAndStake(t.context);
  const stakingFeedAddress = t.context.pricefeeds[0].address;
  const isOperatorBefore = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [stakingFeedAddress]
  );
  const stakedAmountBefore = await t.context.canonicalPriceFeed.instance.totalStakedFor.call(
    {}, [stakingFeedAddress]
  );
  await t.context.canonicalPriceFeed.instance.burnStake.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [stakingFeedAddress, config.protocol.staking.minimumAmount, ""]
  );
  const isOperatorAfter = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [stakingFeedAddress]
  );
  const stakedAmountAfter = await t.context.canonicalPriceFeed.instance.totalStakedFor.call(
    {}, [stakingFeedAddress]
  );
  t.is(Number(stakedAmountBefore), config.protocol.staking.minimumAmount)
  t.is(Number(stakedAmountAfter), 0)
  t.true(isOperatorBefore);
  t.false(isOperatorAfter);
});

test("only governance is allowed to call burnStake", async t => {
  await createPriceFeedAndStake(t.context);
  const stakingFeedAddress = t.context.pricefeeds[0].address;
  const isOperatorBefore = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [t.context.pricefeeds[0].address]
  );
  const stakedAmountBefore = await t.context.canonicalPriceFeed.instance.totalStakedFor.call(
    {}, [stakingFeedAddress]
  );
  await t.context.canonicalPriceFeed.instance.burnStake.postTransaction(
    { from: accounts[1], gas: 6000000 },
    [stakingFeedAddress, config.protocol.staking.minimumAmount, ""]
  );
  const isOperatorAfter = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [stakingFeedAddress]
  );
  const stakedAmountAfter = await t.context.canonicalPriceFeed.instance.totalStakedFor.call(
    {}, [stakingFeedAddress]
  );
  t.deepEqual(stakedAmountAfter, stakedAmountBefore);
  t.true(isOperatorBefore);
  t.true(isOperatorAfter);
});

test("cannot burn stake lower than minimum stake unless it becomes zero", async t => {
  await createPriceFeedAndStake(t.context);
  // Stake additional amount
  const additionalStake = 100;
  const stakingFeedAddress = t.context.pricefeeds[0].address;
  await mlnToken.instance.approve.postTransaction(
    {from: accounts[0]}, [stakingFeedAddress, additionalStake]
  );
  await t.context.pricefeeds[0].instance.depositStake.postTransaction(
    {from: accounts[0]}, [additionalStake, ""]
  );
  const isOperatorBefore = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [stakingFeedAddress]
  );
  const stakedAmountBefore = await t.context.canonicalPriceFeed.instance.totalStakedFor.call(
    {}, [stakingFeedAddress]
  );
  await t.context.canonicalPriceFeed.instance.burnStake.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [stakingFeedAddress, additionalStake + 1, ""]
  );
  const isOperatorAfter = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [stakingFeedAddress]
  );
  const stakedAmountAfter = await t.context.canonicalPriceFeed.instance.totalStakedFor.call(
    {}, [stakingFeedAddress]
  );
  t.deepEqual(stakedAmountAfter, stakedAmountBefore);
  t.true(isOperatorBefore);
  t.true(isOperatorAfter);

  // Works if stake is burnt equal or greater than minimum stake
  await t.context.canonicalPriceFeed.instance.burnStake.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [stakingFeedAddress, additionalStake, ""]
  );
  const isOperatorFurtherAfter = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [stakingFeedAddress]
  );
  const stakedAmountFurtherAfter = await t.context.canonicalPriceFeed.instance.totalStakedFor.call(
    {}, [stakingFeedAddress]
  );
  t.true(isOperatorFurtherAfter);
  t.is(Number(stakedAmountFurtherAfter), config.protocol.staking.minimumAmount);
});
