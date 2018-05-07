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
const defaultMlnPrice = 10 ** 18;

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

function bytesToAscii(byteArray) {
  while(byteArray[byteArray.length-1] === 0) {
    byteArray.pop();    // strip zeros from end of array
  }
  return api.util.hexToAscii(api.util.bytesToHex(byteArray));
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

// get unix timestamp for a tx
async function txidToTimestamp(txid) {
  const receipt = await api.eth.getTransactionReceipt(txid);
  const timestamp = (await api.eth.getBlockByHash(receipt.blockHash)).timestamp;
  return Math.round(new Date(timestamp).getTime()/1000);
}

async function mineSeconds(seconds) {
  for (let i = 0; i < seconds; i++) {
    await sleep(1000);
    await api.eth.sendTransaction();
  }
}

// TODO: remove this in future (when parity devchain implements fast-forwarding blockchain time)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      [
        config.protocol.pricefeed.interval, config.protocol.pricefeed.validity,
        config.protocol.pricefeed.preEpochUpdatePeriod, config.protocol.pricefeed.minimumUpdates
      ],
      [config.protocol.staking.minimumAmount, config.protocol.staking.numOperators],
      accounts[0]
    ], () => {}, true
  );
  t.context.pricefeeds = [];
});

test("can register assets, as well as update and remove them", async t => {
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

  await t.context.canonicalPriceFeed.instance.updateAsset.postTransaction(opts, [
    eurToken.address,
    'New name',
    'NEW',
    12,
    eurUrl,
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ]);
  const updatedInfo = await t.context.canonicalPriceFeed.instance.assetInformation.call({}, [eurToken.address]);

  t.is(bytesToAscii(updatedInfo[1]), "New name");
  t.is(bytesToAscii(updatedInfo[2]), "NEW");
  t.is(Number(updatedInfo[3]), 12);

  await t.context.canonicalPriceFeed.instance.removeAsset.postTransaction(opts, [
    eurToken.address, 1
  ]);
  const eurRegisteredPostRemoval = await t.context.canonicalPriceFeed.instance.assetIsRegistered.call({}, [eurToken.address]);

  t.false(eurRegisteredPostRemoval);
});

test("can register exchanges, as well as update and remove them", async t => {
  const mockBytes4 = "0x12345678"
  await t.context.canonicalPriceFeed.instance.registerExchange.postTransaction(opts, [
    deployed.MatchingMarket.address,
    deployed.MatchingMarketAdapter.address,
    true,
    [mockBytes4]
  ]);
  await t.context.canonicalPriceFeed.instance.registerExchange.postTransaction(opts, [
    deployed.SimpleMarket.address,
    deployed.SimpleAdapter.address,
    false,
    [mockBytes4]
  ]);

  const matchingMarketRegistered = await t.context.canonicalPriceFeed.instance.exchangeIsRegistered.call({}, [deployed.MatchingMarket.address]);
  const simpleMarketRegistered = await t.context.canonicalPriceFeed.instance.exchangeIsRegistered.call({}, [deployed.SimpleMarket.address]);
  let registeredExchanges = await t.context.canonicalPriceFeed.instance.getRegisteredExchanges.call();
  registeredExchanges = registeredExchanges.map(e => e._value);
  const allExchangesInRegistry =
    registeredExchanges.includes(deployed.MatchingMarket.address) &&
    registeredExchanges.includes(deployed.SimpleMarket.address)

  t.true(matchingMarketRegistered);
  t.true(simpleMarketRegistered);
  t.true(allExchangesInRegistry);

  await t.context.canonicalPriceFeed.instance.updateExchange.postTransaction(opts, [
    deployed.MatchingMarket.address,
    deployed.SimpleAdapter.address,
    false,
    []
  ]);
  const updatedInfo = await t.context.canonicalPriceFeed.instance.exchangeInformation.call({}, [deployed.MatchingMarket.address]);
  const functionAllowedPostUpdate = await t.context.canonicalPriceFeed.instance.exchangeMethodIsAllowed.call({}, [deployed.MatchingMarket.address, mockBytes4]);

  t.is(updatedInfo[1], deployed.SimpleAdapter.address);
  t.false(updatedInfo[2]);
  t.false(functionAllowedPostUpdate);

  await t.context.canonicalPriceFeed.instance.removeExchange.postTransaction(opts, [
    deployed.MatchingMarket.address, 0
  ]);
  const matchingMarketRegisteredPostRemoval = await t.context.canonicalPriceFeed.instance.exchangeIsRegistered.call({}, [deployed.MatchingMarket.address]);

  t.false(matchingMarketRegisteredPostRemoval);
});

test("staked pricefeed gets price accounted for, but does not count when unstaked", async t => {
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context.canonicalPriceFeed);
  const firstPrice = 150000000;
  const secondPrice = 20000000000;
  await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0]},
    [[mlnToken.address, eurToken.address], [defaultMlnPrice, firstPrice]]
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
  const isOperatorAfterUnstaked = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [t.context.pricefeeds[0].address]
  );
  await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0]},
    [[mlnToken.address, eurToken.address], [defaultMlnPrice, firstPrice]]
  );    // tx expected to fail, since no longer an operator. This means no price is updated.
  const [subfeedPriceUnstaked, ] = await t.context.pricefeeds[0].instance.getPrice.call(
    {from: accounts[0]}, [eurToken.address]
  );
  const [canonicalPriceUnstaked, ] = await t.context.canonicalPriceFeed.instance.getPrice.call(
    {from: accounts[0]}, [eurToken.address]
  );

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
  await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [mlnToken.address, eurToken.address, ethToken.address, mockBtcAddress],
      [defaultMlnPrice, inputPriceEur, inputPriceEth, inputPriceBtc],
    ]
  );
  const [eurPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [eurToken.address]),
  );
  const [ethPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [ethToken.address]),
  );
  const [btcPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [mockBtcAddress]),
  );
  const [mlnPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [mlnToken.address]),
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
    await t.context.pricefeeds[i].instance.update.postTransaction(
      { from: accounts[0], gas: 6000000 },
      [[mlnToken.address, eurToken.address], [defaultMlnPrice, prices[i]]],
    );
  }
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
      [[mlnToken.address, eurToken.address], [defaultMlnPrice, prices[i]]],
    );
  }
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
        { from: accounts[0] }, [[mlnToken.address, eurToken.address], [defaultMlnPrice, price]],
      );
    }
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

test.only("updates can only occur within last N seconds before a new epoch", async t => {
  const inputGas = 6000000;
  const initialEurPrice = new BigNumber(10 ** 10);
  const modifiedEurPrice1 = new BigNumber(2 * 10 ** 10);
  const modifiedEurPrice2 = new BigNumber(3 * 10 ** 10);
  const interval = 10; // TODO: rename epochDuration?
  const validity = 10;
  const preEpochUpdatePeriod = 5;
  const minimumUpdates = 1;

  // overwrite the context pricefeed
  t.context.canonicalPriceFeed = await deployContract(
    "pricefeeds/CanonicalPriceFeed", { from: accounts[0], gas: 6900000 },
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
      [interval, validity, preEpochUpdatePeriod, minimumUpdates],
      [config.protocol.staking.minimumAmount, config.protocol.staking.numOperators],
      accounts[0]
    ], () => {}, true
  );
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context.canonicalPriceFeed);

  let txid = await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0], gas: inputGas},
    [[mlnToken.address, eurToken.address], [defaultMlnPrice, initialEurPrice]]
  );    // set first epoch time
  const update1Time = await txidToTimestamp(txid)

  txid = await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0], gas: inputGas},
    [[mlnToken.address, eurToken.address], [defaultMlnPrice, modifiedEurPrice1]]
  );    // expected to fail, since it is before update time
  const update2Time = await txidToTimestamp(txid)
  const gasUsedPrematureUpdate = (await api.eth.getTransactionReceipt(txid)).gasUsed;
  const [eurPricePrematureUpdate, ] = await t.context.canonicalPriceFeed.instance.getPrice.call(
    {}, [eurToken.address]
  );

  t.true((update2Time - update1Time) < preEpochUpdatePeriod); // 2nd update was premature
  t.is(Number(gasUsedPrematureUpdate), inputGas);   // expect a thrown tx (all gas consumed)
  t.is(Number(eurPricePrematureUpdate), Number(initialEurPrice)); // price did not update

  await mineSeconds(7);

  const nextEpochTime = await t.context.canonicalPriceFeed.instance.getNextEpochTime.call();
  txid = await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0], gas: inputGas},
    [[mlnToken.address, eurToken.address], [defaultMlnPrice, modifiedEurPrice1]]
  );
  const update3Time = await txidToTimestamp(txid)
  console.log(`UPDATE 3 GAS: ${(await api.eth.getTransactionReceipt(txid)).gasUsed}`)
  const [eurPriceAfterUpdate3, ] = await t.context.canonicalPriceFeed.instance.getPrice.call(
    {}, [eurToken.address]
  );
  txid = await t.context.pricefeeds[1].instance.update.postTransaction(
    { from: accounts[0], gas: inputGas},
    [[mlnToken.address, eurToken.address], [defaultMlnPrice, modifiedEurPrice2]]
  );
  const update4Time = await txidToTimestamp(txid)
  const [eurPriceAfterUpdate4, ] = await t.context.canonicalPriceFeed.instance.getPrice.call(
    {}, [eurToken.address]
  );

  // console.log(`UPDATE 4 GAS: ${(await api.eth.getTransactionReceipt(txid)).gasUsed}`)
  // console.log(`UPDATE 4 TIME: ${update4Time}`)
  // console.log(`LAST UPDATE TIME: ${await t.context.canonicalPriceFeed.instance.lastUpdateTime.call()}`)
  // console.log(`LAST EPOCH TIME: ${await t.context.canonicalPriceFeed.instance.getLastEpochTime.call()}`)
  // console.log(`NEXT EPOCH TIME: ${await t.context.canonicalPriceFeed.instance.getNextEpochTime.call()}`)

  t.true((nextEpochTime - update3Time) <= preEpochUpdatePeriod);
  t.true((nextEpochTime - update4Time) <= preEpochUpdatePeriod);
  t.is(Number(eurPriceAfterUpdate3), Number(modifiedEurPrice1)); // canonical price at 1st update
  t.is(
    Number(eurPriceAfterUpdate4),
    Number(medianize([modifiedEurPrice1, modifiedEurPrice2]))
  ); // canonical price is median of prices after two updates
});

test.todo("authority can toggle updating, and turning off before delay ends prevents update");

test("governance can pause the feed so price fetching throwss", async t => {
  await createPriceFeedAndStake(t.context);
  await createPriceFeedAndStake(t.context);
  const prices = [new BigNumber(10 ** 20), new BigNumber(2 * 10 ** 20)];
  await registerEur(t.context.canonicalPriceFeed);
  for (let i = 0; i < t.context.pricefeeds.length; i += 1) {
    await t.context.pricefeeds[i].instance.update.postTransaction(
      { from: accounts[0], gas: 6000000 },
      [[mlnToken.address, eurToken.address], [defaultMlnPrice, prices[i]]],
    );
  }
  const [priceBefore, ] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPrice.call({}, [
      eurToken.address
    ]),
  );
  await t.context.canonicalPriceFeed.instance.pause.postTransaction(
    { from: accounts[0], gas: 6000000 },
    []
  );
  const [priceAfter, ] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPrice.call({}, [
      eurToken.address
    ]),
  );
  t.deepEqual(priceBefore, prices[1]);
  t.is(Number(priceAfter), 0);
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
