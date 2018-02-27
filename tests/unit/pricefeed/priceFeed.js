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
  t.context.pricefeed = await deployContract(
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
  );
});

// tests (concurrent)

test("registers twice without error", async t => {
  await registerEur(t.context.pricefeed);
  await registerEth(t.context.pricefeed);
  const [
    ,
    ,
    ,
    ,
    eurRegistered,
  ] = await t.context.pricefeed.instance.information.call({}, [
    eurToken.address,
  ]);
  const [
    ,
    ,
    ,
    ,
    ethRegistered,
  ] = await t.context.pricefeed.instance.information.call({}, [
    ethToken.address,
  ]);
  const [
    ,
    ,
    ,
    ,
    mlnRegistered,
  ] = await t.context.pricefeed.instance.information.call({}, [
    mlnToken.address,
  ]);

  t.true(eurRegistered);
  t.true(ethRegistered);
  t.true(mlnRegistered); // MLN registered by default
});

test("gets registered information", async t => {
  await registerEur(t.context.pricefeed);
  const result = await t.context.pricefeed.instance.information.call({}, [
    eurToken.address,
  ]);
  const [
    breakIn,
    breakOut,
    chainId,
    decimal,
    exists,
    ipfsHash,
    name,
    price,
    symbol,
    timestamp,
    url,
  ] = Object.values(result);

  t.is(breakIn, mockBreakIn);
  t.is(breakOut, mockBreakOut);
  t.is(Number(decimal), eurDecimals);
  t.deepEqual(chainId, Array.from(Array(32), () => 0));
  t.true(exists);
  t.is(ipfsHash, mockIpfs);
  t.is(name, eurName);
  t.is(Number(price), 0); // no price update yet
  t.is(symbol, eurSymbol);
  t.is(Number(timestamp), 0); // no price update yet
  t.is(url, eurUrl);
});

test("gets getOrderPrice for orders containing assets with different decimals", async t => {
  await registerEur(t.context.pricefeed);
  await registerEth(t.context.pricefeed);
  await registerBtc(t.context.pricefeed);
  const inputPriceEur = 150000000;
  const inputPriceEth = 2905;
  const inputPriceBtc = 12000000000;
  await t.context.pricefeed.instance.update.postTransaction(
    { from: accounts[0], gas: 6000000 },
    [
      [eurToken.address, ethToken.address, mockBtcAddress],
      [inputPriceEur, inputPriceEth, inputPriceBtc],
    ],
  );
  const [eurIsRecent, eurPrice, returnedEurDecimals] = Object.values(
    await t.context.pricefeed.instance.getPrice.call({}, [eurToken.address]),
  );
  const [ethIsRecent, ethPrice, returnedEthDecimals] = Object.values(
    await t.context.pricefeed.instance.getPrice.call({}, [ethToken.address]),
  );

  t.is(inputPriceEur, Number(eurPrice));
  t.true(eurIsRecent);
  t.is(eurDecimals, Number(returnedEurDecimals));
  t.is(inputPriceEth, Number(ethPrice));
  t.true(ethIsRecent);
  t.is(18, Number(returnedEthDecimals));
});

test("Joseph", async t => {
  await registerEur(t.context.pricefeed);
  await registerEth(t.context.pricefeed);
  await registerBtc(t.context.pricefeed);

  const tradeQuantitiesinWholeUnits = {
    MLN: new BigNumber(120),
    EUR: new BigNumber(24000),
    BTC: new BigNumber(30),
  };

  const orderPrice1 = await t.context.pricefeed.instance.getOrderPrice.call(
    {},
    [
      mockBtcAddress,
      mlnToken.address,
      tradeQuantitiesinWholeUnits.BTC * 10 ** btcDecimals,
      tradeQuantitiesinWholeUnits.MLN * 10 ** mlnDecimals,
    ],
  );

  const orderPrice2 = await t.context.pricefeed.instance.getOrderPrice.call(
    {},
    [
      eurToken.address,
      mlnToken.address,
      tradeQuantitiesinWholeUnits.EUR * 10 ** eurDecimals,
      tradeQuantitiesinWholeUnits.MLN * 10 ** mlnDecimals,
    ],
  );

  const orderPrice3 = await t.context.pricefeed.instance.getOrderPrice.call(
    {},
    [
      eurToken.address,
      mockBtcAddress,
      tradeQuantitiesinWholeUnits.EUR * 10 ** eurDecimals,
      tradeQuantitiesinWholeUnits.BTC * 10 ** btcDecimals,
    ],
  );

  const orderPrice4 = await t.context.pricefeed.instance.getOrderPrice.call(
    {},
    [
      mlnToken.address,
      mockBtcAddress,
      tradeQuantitiesinWholeUnits.MLN * 10 ** mlnDecimals,
      tradeQuantitiesinWholeUnits.BTC * 10 ** btcDecimals,
    ],
  );

  t.deepEqual(
    orderPrice1.toNumber(),
    tradeQuantitiesinWholeUnits.MLN /
      tradeQuantitiesinWholeUnits.BTC *
      10 ** mlnDecimals,
  );
  t.deepEqual(
    orderPrice2.toNumber(),
    tradeQuantitiesinWholeUnits.MLN /
      tradeQuantitiesinWholeUnits.EUR *
      10 ** mlnDecimals,
  );
  t.deepEqual(
    orderPrice3.toNumber(),
    tradeQuantitiesinWholeUnits.BTC /
      tradeQuantitiesinWholeUnits.EUR *
      10 ** btcDecimals,
  );
  t.deepEqual(
    orderPrice4.toNumber(),
    tradeQuantitiesinWholeUnits.BTC /
      tradeQuantitiesinWholeUnits.MLN *
      10 ** btcDecimals,
  );
});
