import test from "ava";
import Api from "@parity/api";
import * as deployedUtils from "../../utils/lib/utils";
import deploy from "../../utils/deploy/contracts";

const addressBook = require("../../addressBook.json");
const BigNumber = require("bignumber.js");
const environmentConfig = require("../../utils/config/environment.js");
const fs = require("fs");

const environment = "development";
const addresses = addressBook[environment];
const config = environmentConfig[environment];
const provider = new Api.Provider.Http(`http://${config.host}:${config.port}`);
const api = new Api(provider);

// hoisted variables
let accounts;
let deployer;
let exchange;
let fund;
let manager;
let investor;
let worker;
let opts;
let version;
let mlnToken;
let pricefeed;
let maliciousToken;

const mockBytes = "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
const initialMln = 1000000;
const incentive = 1000;
const offeredMln = 500000;
const wantedShares = 500000;

test.before(async () => {
  await deploy(environment);
  accounts = await deployedUtils.accounts;
  deployer = accounts[0];
  manager = accounts[1];
  investor = accounts[2];
  worker = accounts[3];
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployedUtils.version;
  mlnToken = await deployedUtils.mlnToken;
  let abi = JSON.parse(fs.readFileSync("out/testing/MaliciousToken.abi"));
  let bytecode = fs.readFileSync("out/testing/MaliciousToken.bin");
  const maliciousTokenDeployment = await api.newContract(abi).deploy(
    {from: deployer, data: `0x${bytecode}`},
    []
  );
  maliciousToken = await api.newContract(abi, maliciousTokenDeployment);

  // investor needs some MLN to use
  await mlnToken.instance.transfer.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [investor, initialMln, ""],
  );

  // get market
  abi = JSON.parse(
    fs.readFileSync("out/exchange/thirdparty/SimpleMarket.abi"),
  );
  exchange = await api.newContract(abi, addresses.SimpleMarket);

  // deploy pricefeed
  abi = JSON.parse(fs.readFileSync("out/pricefeeds/PriceFeed.abi"));
  bytecode = fs.readFileSync("out/pricefeeds/PriceFeed.bin");
  opts.data = `0x${bytecode}`;

  const pricefeedDeployment = await api
    .newContract(abi)
    .deploy(opts, [
      mlnToken.address,
      'Melon Token',
      'MLN-T',
      18,
      'melonport.com',
      mockBytes,
      mockBytes,
      mockAddress,
      mockAddress,
      config.protocol.datafeed.interval,
      config.protocol.datafeed.validity,
    ]);
  pricefeed = await api.newContract(abi, pricefeedDeployment);
  await pricefeed.instance.register.postTransaction(
    {from: deployer},
    [ maliciousToken.address, '', '', 18, '', '', mockBytes, mockAddress, mockAddress ]
  );

  const hash = "0x47173285a8d7341e5e972fc677286384f802f8ef42a5ec5f03bbfa254cb01fad";
  let sig = await api.eth.sign(manager, hash);
  sig = sig.substr(2, sig.length);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseFloat(sig.substr(128, 2)) + 27;
  await version.instance.setupFund.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      "Fund with malicious token",  // name
      addresses.MlnToken,           // reference asset
      config.protocol.fund.managementReward,
      config.protocol.fund.performanceReward,
      addresses.NoCompliance,
      addresses.RMMakeOrders,
      pricefeed.address,
      [addresses.SimpleMarket],
      [addresses.simpleAdapter],
      v,
      r,
      s,
    ],
  );
  const fundAddress = await version.instance.managerToFunds.call({}, [manager]);
  const fundAbi = JSON.parse(fs.readFileSync("out/Fund.abi"));
  fund = await api.newContract(fundAbi, fundAddress);
});

test.serial("initial investment with MLN", async t => {
  await mlnToken.instance.approve.postTransaction(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas },
    [fund.address, incentive + offeredMln],
  );
  await fund.instance.requestSubscription.postTransaction(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice },
    [offeredMln, wantedShares, incentive],
  );
  // do pricefeed updates
  await pricefeed.instance.update.postTransaction(
    {from: deployer},
    [[mlnToken.address, maliciousToken.address],
    [new BigNumber(10 ** 18), new BigNumber(10 ** 18)]]
  );
  await pricefeed.instance.update.postTransaction(
    {from: deployer},
    [[mlnToken.address, maliciousToken.address],
    [new BigNumber(10 ** 18), new BigNumber(10 ** 18)]]
  );
  const requestId = await fund.instance.getLastRequestId.call({}, []);
  await fund.instance.executeRequest.postTransaction(
    { from: worker, gas: config.gas, gasPrice: config.gasPrice },
    [requestId],
  );

  const ownedShares = Number(await fund.instance.balanceOf.call({}, [investor]));

  t.deepEqual(ownedShares, wantedShares);
});

test.serial("fund buys some MaliciousToken", async t => {
  const sellQuantity = 1000;
  const buyQuantity = 1000;

  await fund.instance.makeOrder.postTransaction(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice },
    [
      0,
      mlnToken.address,
      maliciousToken.address,
      sellQuantity,
      buyQuantity,
    ]
  );
  const orderId = await exchange.instance.last_offer_id.call({}, []);
  await maliciousToken.instance.approve.postTransaction(
    { from: deployer, gasPrice: config.gasPrice },
    [exchange.address, buyQuantity + 100],
  );

  // third party takes order
  await exchange.instance.buy.postTransaction(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice },
    [orderId, sellQuantity],
  );

  const maliciousBalance = Number(await maliciousToken.instance.balanceOf.call({}, [fund.address]));

  t.is(maliciousBalance, buyQuantity);
});

test.serial("MaliciousToken becomes malicious", async t => {
  await maliciousToken.instance.startThrowing.postTransaction({}, []);

  const isThrowing = await maliciousToken.instance.isThrowing.call({}, []);
  t.true(isThrowing);
});

test.serial("Other assets can be redeemed, when MaliciousToken is throwing", async t => {
  const preShareQuantity = await fund.instance.balanceOf.call({}, [investor]);
  const preMlnQuantity = await mlnToken.instance.balanceOf.call({}, [investor]);
  await fund.instance.emergencyRedeem.postTransaction(
    { from: investor, gas: 6000000 },
    [preShareQuantity, [mlnToken.address]]
  );
  const postShareQuantity = await fund.instance.balanceOf.call({}, [investor]);
  const postMlnQuantity = await mlnToken.instance.balanceOf.call({}, [investor]);

  t.is(Number(postShareQuantity), 0)
  t.is(Number(postMlnQuantity), Number(preMlnQuantity) + offeredMln - incentive);
});
