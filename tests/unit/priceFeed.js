import test from "ava";
import Api from "@parity/api";
import * as deployed from "../../utils/lib/utils";

const fs = require("fs");
const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let eurToken;
let ethToken;
let mlnToken;
let accounts;
let opts;

// mock data
const mockIpfs = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockBreakIn = "0x0360E6384FEa0791e18151c531fe70da23c55fa2";
const mockBreakOut = "0xc6Eb2A235627Ac97EAbc6452F98Ce296a1EF3984";
const eurName = "Euro Token";
const eurSymbol = "EUR-T";
const eurDecimals = 8;
const eurUrl = "europa.eu";

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
    18,
    "ethereum.org",
    mockIpfs,
    mockBytes,
    mockBreakIn,
    mockBreakOut,
  ]);
}

// hooks

test.before(async () => {
  accounts = await api.eth.accounts();
  opts = { from: accounts[0], gas: config.gas };
  ethToken = await deployed.ethToken;
  eurToken = await deployed.eurToken;
  mlnToken = await deployed.mlnToken;
});

test.beforeEach(async t => {
  const abi = JSON.parse(fs.readFileSync("out/pricefeeds/PriceFeed.abi"));
  const bytecode = fs.readFileSync("out/pricefeeds/PriceFeed.bin");
  const pricefeedDeployment = await api.newContract(abi)
    .deploy({from: accounts[0], data: `0x${bytecode}`}, [
      mlnToken.address,
      'Melon Token',
      'MLN-T',
      18,
      'melonport.com',
      mockBytes,
      mockBytes,
      mockBreakIn,
      mockBreakOut,
      config.protocol.datafeed.interval,
      config.protocol.datafeed.validity,
    ]);
  t.context.pricefeed = (await api.newContract(abi, pricefeedDeployment));
});

// tests (concurrent)

test("registers twice without error", async t => {
  await registerEur(t.context.pricefeed);
  await registerEth(t.context.pricefeed);
  const eurRegistered = (await t.context.pricefeed.instance.information.call({}, [eurToken.address]))[4];
  const ethRegistered = (await t.context.pricefeed.instance.information.call({}, [ethToken.address]))[4];
  const mlnRegistered = (await t.context.pricefeed.instance.information.call({}, [mlnToken.address]))[4];

  t.true(eurRegistered);
  t.true(ethRegistered);
  t.true(mlnRegistered); // MLN registered by default
});

test("gets registered information", async t => {
  await registerEur(t.context.pricefeed);
  const result = await t.context.pricefeed.instance.information.call({}, [eurToken.address]);
  const [breakIn, breakOut, chainId, decimal, exists, ipfsHash, name, price, symbol, timestamp, url] = Object.values(result);

  t.is(breakIn, mockBreakIn);
  t.is(breakOut, mockBreakOut);
  t.is(Number(decimal), eurDecimals);
  t.deepEqual(chainId, Array.from(Array(32), () => 0));
  t.true(exists);
  t.is(ipfsHash, mockIpfs);
  t.is(name, eurName);
  t.is(Number(price), 0);       // no price update yet
  t.is(symbol, eurSymbol);
  t.is(Number(timestamp), 0);   // no price update yet
  t.is(url, eurUrl);
});

test("registers pricefeed update", async t => {
  await registerEur(t.context.pricefeed);
  await registerEth(t.context.pricefeed);
  const inputPriceEur = 150000000;
  const inputPriceEth = 2905;
  await t.context.pricefeed.instance.update.postTransaction({from: accounts[0], gas:6000000}, [
    [eurToken.address, ethToken.address],
    [inputPriceEur, inputPriceEth],
  ]);
  const [eurIsRecent, eurPrice, returnedEurDecimals] = Object.values(await t.context.pricefeed.instance.getPrice.call({}, [eurToken.address]));
  const [ethIsRecent, ethPrice, returnedEthDecimals] = Object.values(await t.context.pricefeed.instance.getPrice.call({}, [ethToken.address]));
 
  t.is(inputPriceEur, Number(eurPrice));
  t.true(eurIsRecent);
  t.is(eurDecimals, Number(returnedEurDecimals));
  t.is(inputPriceEth, Number(ethPrice));
  t.true(ethIsRecent);
  t.is(18, Number(returnedEthDecimals));
});
