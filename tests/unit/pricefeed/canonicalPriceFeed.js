import test from "ava";
import web3 from "../../../utils/lib/web3";
import { deployContract } from "../../../utils/lib/contracts";
import { newMockAddress } from "../../../utils/lib/mocks";
import createStakingFeed from "../../../utils/lib/createStakingFeed";

const environmentConfig = require("../../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = "development";
const config = environmentConfig[environment];
BigNumber.config({ DECIMAL_PLACES: 18 });

// hoisted variables
let accounts;

// mock data
const mockBtcAddress = newMockAddress();
const mockEthAddress = newMockAddress();
const mockEurAddress = newMockAddress();
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
function registerEur(context) {
  return context.canonicalPriceFeed.methods.registerAsset(
    mockEurAddress,
    web3.utils.padLeft(web3.utils.toHex('Euro Token'), 34),
    web3.utils.padLeft(web3.utils.toHex('EUR-T'), 34),
    eurDecimals,
    "europa.eu",
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send({from: accounts[0]});
}

function registerEth(context) {
  return context.canonicalPriceFeed.methods.registerAsset(
    mockEthAddress,
    web3.utils.padLeft(web3.utils.toHex('Ethereum'), 34),
    web3.utils.padLeft(web3.utils.toHex('ETH'), 34),
    ethDecimals,
    "ethereum.org",
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send({from: accounts[0]});
}

function registerBtc(context) {
  return context.canonicalPriceFeed.methods.registerAsset(
    mockBtcAddress,
    web3.utils.padLeft(web3.utils.toHex('Bitcoin'), 34),
    web3.utils.padLeft(web3.utils.toHex('BTC'), 34),
    btcDecimals,
    "bitcoin.org",
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send({from: accounts[0]});
}

// hex to ascii string, stripping extra zereoes in case of fixed length bytes
function hexToAsciiStrip(hexString) {
  return web3.utils.hexToAscii(hexString.replace(/0+$/, ""));
}

async function createPriceFeedAndStake(context) {
  const stakingFeed = await createStakingFeed({from: accounts[0], gas: 6000000}, context.canonicalPriceFeed);
  await context.mlnToken.methods.approve(stakingFeed.options.address, config.protocol.staking.minimumAmount).send({from: accounts[0]});
  await stakingFeed.methods.depositStake(config.protocol.staking.minimumAmount, "0x00").send({from: accounts[0], gas: 6500000});
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
  accounts = await web3.eth.getAccounts();
});

test.beforeEach(async t => {
  t.context.mlnToken = await deployContract(
    "assets/PreminedAsset",
    {from: accounts[0], gas: config.gas}
  );
  t.context.canonicalPriceFeed = await deployContract(
    "pricefeeds/CanonicalPriceFeed",
    {from: accounts[0], gas: config.gas},
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
  await registerEth(t.context);
  await registerEur(t.context);
  const eurRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(mockEurAddress).call();
  const ethRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(mockEthAddress).call();
  const mlnRegistered = await t.context.canonicalPriceFeed.methods.assetIsRegistered(t.context.mlnToken.options.address).call();
  const registeredAssets = await t.context.canonicalPriceFeed.methods.getRegisteredAssets().call();
  const allInRegistry =
    registeredAssets.includes(mockEurAddress) &&
    registeredAssets.includes(mockEthAddress) &&
    registeredAssets.includes(t.context.mlnToken.options.address)

  t.true(eurRegistered);
  t.true(ethRegistered);
  t.true(mlnRegistered); // MLN registered by default
  t.true(allInRegistry);

  await t.context.canonicalPriceFeed.methods.updateAsset(
    mockEurAddress,
    web3.utils.asciiToHex('New name'),
    web3.utils.asciiToHex('NEW'),
    12,
    web3.utils.asciiToHex("europa.eu"),
    mockIpfs,
    [mockBreakIn, mockBreakOut],
    [],
    []
  ).send({from: accounts[0]});
  const updatedInfo = await t.context.canonicalPriceFeed.methods.assetInformation(mockEurAddress).call();

  t.is(hexToAsciiStrip(updatedInfo[1]), "New name");
  t.is(hexToAsciiStrip(updatedInfo[2]), "NEW");
  t.is(Number(updatedInfo[3]), 12);

  await t.context.canonicalPriceFeed.methods.removeAsset(mockEurAddress, 2).send({from: accounts[0]});
  const eurRegisteredPostRemoval = await t.context.canonicalPriceFeed.methods.assetIsRegistered(mockEurAddress).call();

  t.false(eurRegisteredPostRemoval);
});

test("can register exchanges, as well as update and remove them", async t => {
  const mockExchange1 = newMockAddress();
  const mockAdapter1 = newMockAddress();
  const mockExchange2 = newMockAddress();
  const mockAdapter2 = newMockAddress();
  await t.context.canonicalPriceFeed.methods.registerExchange(
    mockExchange1,
    mockAdapter1,
    true,
    [mockBytes4]
  ).send({from: accounts[0]});
  await t.context.canonicalPriceFeed.methods.registerExchange(
    mockExchange2,
    mockAdapter2,
    false,
    [mockBytes4]
  ).send({from: accounts[0]});

  const matchingMarketRegistered = await t.context.canonicalPriceFeed.methods.exchangeIsRegistered(mockExchange1).call();
  const simpleMarketRegistered = await t.context.canonicalPriceFeed.methods.exchangeIsRegistered(mockExchange2).call();
  const registeredExchanges = await t.context.canonicalPriceFeed.methods.getRegisteredExchanges().call();
  const allExchangesInRegistry =
    registeredExchanges.includes(mockExchange1) &&
    registeredExchanges.includes(mockExchange2)

  t.true(matchingMarketRegistered);
  t.true(simpleMarketRegistered);
  t.true(allExchangesInRegistry);

  await t.context.canonicalPriceFeed.methods.updateExchange(
    mockExchange1,
    mockAdapter2,
    false,
    []
  ).send({from: accounts[0]});
  const updatedInfo = await t.context.canonicalPriceFeed.methods.exchangeInformation(mockExchange1).call();
  const functionAllowedPostUpdate = await t.context.canonicalPriceFeed.methods.exchangeMethodIsAllowed(mockExchange1, mockBytes4).call();

  t.is(updatedInfo[1], mockAdapter2);
  t.false(updatedInfo[2]);
  t.false(functionAllowedPostUpdate);

  await t.context.canonicalPriceFeed.methods.removeExchange(
    mockExchange1, 0
  ).send({from: accounts[0]});
  const matchingMarketRegisteredPostRemoval = await t.context.canonicalPriceFeed.methods.exchangeIsRegistered(mockExchange1).call();

  t.false(matchingMarketRegisteredPostRemoval);
});

test("staked pricefeed gets price accounted for, but does not count when unstaked", async t => {
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context);
  const firstPrice = 150000000;
  await t.context.pricefeeds[0].methods.update(
    [t.context.mlnToken.options.address, mockEurAddress], [defaultMlnPrice, firstPrice]
  ).send({from: accounts[0], gas: 6000000});
  await t.context.canonicalPriceFeed.methods.collectAndUpdate([t.context.mlnToken.options.address, mockEurAddress]).send({from: accounts[0], gas: 6000000});
  const isOperatorWhileStaked = await t.context.canonicalPriceFeed.methods.isOperator(
    t.context.pricefeeds[0].options.address
  ).call();
  const [subfeedPriceStaked, ] = Object.values(await t.context.pricefeeds[0].methods.getPrice(
    mockEurAddress
  ).call());
  const [canonicalPriceStaked, ] = Object.values(await t.context.canonicalPriceFeed.methods.getPrice(
    mockEurAddress
  ).call());

  t.true(isOperatorWhileStaked);
  t.is(firstPrice, Number(subfeedPriceStaked));
  t.is(firstPrice, Number(canonicalPriceStaked));
  await t.context.pricefeeds[0].methods.unstake(
    config.protocol.staking.minimumAmount, "0x00"
  ).send({from: accounts[0], gas: 6000000});
  const isOperatorAfterUnstaked = await t.context.canonicalPriceFeed.methods.isOperator(
    t.context.pricefeeds[0].options.address
  ).call();
  await t.context.pricefeeds[0].methods.update(
    [t.context.mlnToken.options.address, mockEurAddress], [defaultMlnPrice, firstPrice]
  ).send({from: accounts[0], gas: 6000000}); // tx expected to fail, since no longer an operator. This means no price is updated.
  const [subfeedPriceUnstaked, ] = Object.values(await t.context.pricefeeds[0].methods.getPrice(
    mockEurAddress
  ).call());
  const [canonicalPriceUnstaked, ] = Object.values(await t.context.canonicalPriceFeed.methods.getPrice(
    mockEurAddress
  ).call());
  t.false(isOperatorAfterUnstaked);
  t.is(firstPrice, Number(subfeedPriceUnstaked));
  t.is(firstPrice, Number(canonicalPriceUnstaked));
});

test("subfeed returns price correctly", async t => {
  await createPriceFeedAndStake(t.context);
  await registerEur(t.context);
  await registerEth(t.context);
  await registerBtc(t.context);
  const inputPriceEur = 150000000;
  const inputPriceEth = 2905;
  const inputPriceBtc = 12000000000;
  await t.context.pricefeeds[0].methods.update(
    [t.context.mlnToken.options.address, mockEurAddress, mockEthAddress, mockBtcAddress],
    [defaultMlnPrice, inputPriceEur, inputPriceEth, inputPriceBtc],
  ).send({from: accounts[0], gas: 6000000});
  const [eurPrice, ] = Object.values(
    await t.context.pricefeeds[0].methods.getPrice(mockEurAddress).call()
  );
  const [ethPrice, ] = Object.values(
    await t.context.pricefeeds[0].methods.getPrice(mockEthAddress).call()
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
  await registerEur(t.context);
  for (let i = 0; i < t.context.pricefeeds.length; i += 1) {
    await t.context.pricefeeds[i].methods.update(
      [t.context.mlnToken.options.address, mockEurAddress], [defaultMlnPrice, prices[i]],
    ).send({from: accounts[0], gas: 6000000});
  }
  await t.context.canonicalPriceFeed.methods.collectAndUpdate([t.context.mlnToken.options.address, mockEurAddress]).send({from: accounts[0], gas: 6000000});
  let ownedFeeds = await t.context.canonicalPriceFeed.methods.getPriceFeedsByOwner(accounts[0]).call();
  const [price, ] = Object.values(
    await t.context.canonicalPriceFeed.methods.getPrice(
      mockEurAddress
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
  await registerEur(t.context);
  for (let i = 0; i < t.context.pricefeeds.length; i += 1) {
    await t.context.pricefeeds[i].methods.update(
      [t.context.mlnToken.options.address, mockEurAddress], [defaultMlnPrice, prices[i]],
    ).send({from: accounts[0], gas: 6000000});
  }
  await t.context.canonicalPriceFeed.methods.collectAndUpdate([t.context.mlnToken.options.address, mockEurAddress]).send({from: accounts[0], gas: 6000000});
  let ownedFeeds = await t.context.canonicalPriceFeed.methods.getPriceFeedsByOwner(accounts[0]).call();
  const [, price] = Object.values(
    await t.context.canonicalPriceFeed.methods.getPriceInfo(mockEurAddress).call()
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
  await registerEur(t.context);

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
        [t.context.mlnToken.options.address, mockEurAddress], [defaultMlnPrice, price]
      ).send({from: accounts[0], gas: 6000000});
      await web3.evm.increaseTime(1);
    }
    await t.context.canonicalPriceFeed.methods.collectAndUpdate([t.context.mlnToken.options.address, mockEurAddress]).send({from: accounts[0], gas: 6000000});
    const operators = (await t.context.canonicalPriceFeed.methods.getOperators().call());
    const [canonicalPrice, ] = Object.values(await t.context.canonicalPriceFeed.methods.getPrice(mockEurAddress).call());

    t.is(Number(canonicalPrice), Number(medianize(prices)));
    t.deepEqual(operators.sort(), t.context.pricefeeds.map(e => e.options.address).sort());
  }
});

// Governance assumed to be accounts[0]
test("governance cannot manually force a price update", async t => {
  await registerEur(t.context);
  const preUpdateId = Number(await t.context.canonicalPriceFeed.methods.updateId().call());

  await t.throws(
    t.context.canonicalPriceFeed.methods.update(
      [mockEurAddress, t.context.mlnToken.options.address],
      [50000, 10000]
    ).send({from: accounts[0], gas: 6000000})
  );

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
  ).send({from: accounts[0]});
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
