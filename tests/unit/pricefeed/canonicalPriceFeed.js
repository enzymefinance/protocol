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

function bytesToAscii(byteArray) {
  while(byteArray[byteArray.length-1] === 0) {
    byteArray.pop();    // strip zeros from end of array
  }
  return web3.utils.hexToAscii(web3.utils.bytesToHex(byteArray));
}

async function createPriceFeedAndStake(context) {
  const stakingFeed = await createStakingFeed(opts, context.canonicalPriceFeed);
  await mlnToken.methods.approve(stakingFeed.options.address, config.protocol.staking.minimumAmount).send({from: accounts[0]});
  await stakingFeed.methods.depositStake(config.protocol.staking.minimumAmount, "").send({from: accounts[0]});
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
  mlnToken = await deployed.MlnToken;
});

test.beforeEach(async t => {
  t.context.canonicalPriceFeed = await deployContract(
    "pricefeeds/CanonicalPriceFeed",
    { from: accounts[0], gas: 6900000 },
    [
      mlnToken.options.address,
      mlnToken.options.address,
      web3.utils.padLeft(web3.utils.toHex('MLN token'), 34),
      web3.utils.padLeft(web3.utils.toHex('MLN-T'), 34),
      mlnDecimals,
      "melonport.com",
      mockBytes,
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
  await registerEur(t.context.canonicalPriceFeed);
  await registerEth(t.context.canonicalPriceFeed);
  const eurRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(eurToken.options.address).call();
  const ethRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(ethToken.options.address).call();
  const mlnRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(mlnToken.options.address).call();
  const registeredAssets = await t.context.canonicalPriceFeed.methods.getRegisteredAssets().call();
  console.log(registeredAssets);
  const allInRegistry =
    registeredAssets.includes(eurToken.options.address) &&
    registeredAssets.includes(ethToken.options.address) &&
    registeredAssets.includes(mlnToken.options.address)
  //t.true(eurRegistered);
  t.true(ethRegistered);
  t.true(mlnRegistered); // MLN registered by default
  t.true(allInRegistry);

  await t.context.canonicalPriceFeed.methods.updateAsset(
    eurToken.options.address,
    'New name',
    'NEW',
    12,
    "europa.eu",
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send(opts);
  const updatedInfo = await t.context.canonicalPriceFeed.methods.assetInformation(eurToken.options.address).call();

  t.is(bytesToAscii(updatedInfo[1]), "New name");
  t.is(bytesToAscii(updatedInfo[2]), "NEW");
  t.is(Number(updatedInfo[3]), 12);

  await t.context.canonicalPriceFeed.methods.removeAsset(eurToken.options.address, 1).send(opts);
  const eurRegisteredPostRemoval = await t.context.canonicalPriceFeed.methods.assetIsRegistered(eurToken.options.address).call();

  t.false(eurRegisteredPostRemoval);
});

test("can register exchanges, as well as update and remove them", async t => {
  const mockBytes4 = "0x12345678"
  const txid = await t.context.canonicalPriceFeed.instance.registerExchange.postTransaction(opts, [
    deployed.MatchingMarket.options.address,
    deployed.MatchingMarketAdapter.options.address,
    true,
    [mockBytes4]
  ]);
  await t.context.canonicalPriceFeed.instance.registerExchange.postTransaction(opts, [
    deployed.SimpleMarket.options.address,
    deployed.SimpleAdapter.options.address,
    false,
    [mockBytes4]
  ]);

  const matchingMarketRegistered = await t.context.canonicalPriceFeed.instance.exchangeIsRegistered.call({}, [deployed.MatchingMarket.options.address]);
  const simpleMarketRegistered = await t.context.canonicalPriceFeed.instance.exchangeIsRegistered.call({}, [deployed.SimpleMarket.options.address]);
  let registeredExchanges = await t.context.canonicalPriceFeed.instance.getRegisteredExchanges.call();
  registeredExchanges = registeredExchanges.map(e => e._value);
  const allExchangesInRegistry =
    registeredExchanges.includes(deployed.MatchingMarket.options.address) &&
    registeredExchanges.includes(deployed.SimpleMarket.options.address)

  t.true(matchingMarketRegistered);
  t.true(simpleMarketRegistered);
  t.true(allExchangesInRegistry);

  await t.context.canonicalPriceFeed.instance.updateExchange.postTransaction(opts, [
    deployed.MatchingMarket.options.address,
    deployed.SimpleAdapter.options.address,
    false,
    []
  ]);
  const updatedInfo = await t.context.canonicalPriceFeed.instance.exchangeInformation.call({}, [deployed.MatchingMarket.options.address]);
  const functionAllowedPostUpdate = await t.context.canonicalPriceFeed.instance.exchangeMethodIsAllowed.call({}, [deployed.MatchingMarket.options.address, mockBytes4]);

  t.is(updatedInfo[1], deployed.SimpleAdapter.options.address);
  t.false(updatedInfo[2]);
  t.false(functionAllowedPostUpdate);

  await t.context.canonicalPriceFeed.instance.removeExchange.postTransaction(opts, [
    deployed.MatchingMarket.options.address, 0
  ]);
  const matchingMarketRegisteredPostRemoval = await t.context.canonicalPriceFeed.instance.exchangeIsRegistered.call({}, [deployed.MatchingMarket.options.address]);

  t.false(matchingMarketRegisteredPostRemoval);
});

test("staked pricefeed gets price accounted for, but does not count when unstaked", async t => {
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context.canonicalPriceFeed);
  const firstPrice = 150000000;
  const secondPrice = 20000000000;
  await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0]},
    [[mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, firstPrice]]
  );
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(opts, [[mlnToken.options.address, eurToken.options.address]]);
  const isOperatorWhileStaked = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [t.context.pricefeeds[0].options.address]
  );
  const [subfeedPriceStaked, ] = await t.context.pricefeeds[0].instance.getPrice.call(
    {from: accounts[0]}, [eurToken.options.address]
  );
  const [canonicalPriceStaked, ] = await t.context.canonicalPriceFeed.instance.getPrice.call(
    {from: accounts[0]}, [eurToken.options.address]
  );

  t.true(isOperatorWhileStaked);
  t.is(firstPrice, Number(subfeedPriceStaked));
  t.is(firstPrice, Number(canonicalPriceStaked));

  await t.context.pricefeeds[0].instance.withdrawStake.postTransaction(
    {from: accounts[0]}, [config.protocol.staking.minimumAmount, ""]
  );
  const isOperatorAfterUnstaked = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [t.context.pricefeeds[0].options.address]
  );
  await t.context.pricefeeds[0].instance.update.postTransaction(
    { from: accounts[0]},
    [[mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, firstPrice]]
  );    // tx expected to fail, since no longer an operator. This means no price is updated.
  const [subfeedPriceUnstaked, ] = await t.context.pricefeeds[0].instance.getPrice.call(
    {from: accounts[0]}, [eurToken.options.address]
  );
  const [canonicalPriceUnstaked, ] = await t.context.canonicalPriceFeed.instance.getPrice.call(
    {from: accounts[0]}, [eurToken.options.address]
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
      [mlnToken.options.address, eurToken.options.address, ethToken.options.address, mockBtcAddress],
      [defaultMlnPrice, inputPriceEur, inputPriceEth, inputPriceBtc],
    ]
  );
  const [eurPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [eurToken.options.address]),
  );
  const [ethPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [ethToken.options.address]),
  );
  const [btcPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [mockBtcAddress]),
  );
  const [mlnPrice, ] = Object.values(
    await t.context.pricefeeds[0].instance.getPrice.call({}, [mlnToken.options.address]),
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
      [[mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, prices[i]]],
    );
  }
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(opts, [[mlnToken.options.address, eurToken.options.address]]);
  let ownedFeeds = await t.context.canonicalPriceFeed.instance.getPriceFeedsByOwner.call({}, [accounts[0]]);
  const [price, ] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPrice.call({}, [
      eurToken.options.address
    ]),
  );
  ownedFeeds = ownedFeeds.map(e => e._value).sort();
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
    await t.context.pricefeeds[i].instance.update.postTransaction(
      { from: accounts[0], gas: 6000000 },
      [[mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, prices[i]]],
    );
  }
  await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(opts, [[mlnToken.options.address, eurToken.options.address]]);
  let ownedFeeds = await t.context.canonicalPriceFeed.instance.getPriceFeedsByOwner.call({}, [accounts[0]]);
  const [, price] = Object.values(
    await t.context.canonicalPriceFeed.instance.getPriceInfo.call({}, [
      eurToken.options.address,
    ]),
  );
  ownedFeeds = ownedFeeds.map(e => e._value).sort();
  const feedAddresses = t.context.pricefeeds.map(e => e.options.address).sort();

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
        { from: accounts[0] }, [[mlnToken.options.address, eurToken.options.address], [defaultMlnPrice, price]],
      );
    }
    await t.context.canonicalPriceFeed.instance.collectAndUpdate.postTransaction(opts, [[mlnToken.options.address, eurToken.options.address]]);
    const operators = (await t.context.canonicalPriceFeed.instance.getOperators.call()).map(e => e._value);
    const [canonicalPrice, ] = await t.context.canonicalPriceFeed.instance.getPrice.call({}, [eurToken.options.address]);

    t.is(Number(canonicalPrice), Number(medianize(prices)));
    t.deepEqual(operators.sort(), t.context.pricefeeds.map(e => e.options.address).sort());
  }
});

// Governance assumed to be accounts[0]
test("governance cannot manually force a price update", async t => {
  await registerEur(t.context.canonicalPriceFeed);
  const preUpdateId = Number(await t.context.canonicalPriceFeed.instance.updateId.call());
  await t.context.canonicalPriceFeed.instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [[eurToken.options.address], [50000]]
  );
  const postUpdateId = Number(await t.context.canonicalPriceFeed.instance.updateId.call());

  t.is(preUpdateId, postUpdateId)
});

test("governance can burn stake of an operator", async t => {
  await createPriceFeedAndStake(t.context);
  const stakingFeedAddress = t.context.pricefeeds[0].options.address;
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
  const stakingFeedAddress = t.context.pricefeeds[0].options.address;
  const isOperatorBefore = await t.context.canonicalPriceFeed.instance.isOperator.call(
    {}, [t.context.pricefeeds[0].options.address]
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
  const stakingFeedAddress = t.context.pricefeeds[0].options.address;
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
