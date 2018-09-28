import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import { getTermsSignatureParameters } from "../../utils/lib/signing";
import { deployContract, retrieveContract } from "../../utils/lib/contracts";
import { updateKyberPriceFeed } from "../../utils/lib/updatePriceFeed";
import governanceAction from "../../utils/lib/governanceAction";
import { makeOrderSignature } from "../../utils/lib/data";

const environmentConfig = require("../../utils/config/environment.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployer;
let fund;
let manager;
let investor;
let opts;
let version;
let mlnToken;
let ethToken;
let maliciousToken;
let deployed;

const mockBytes =
  "0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b";
const mockAddress = "0x083c41ea13af6c2d5aaddf6e73142eb9a7b00183";
const initialEth = 1000000;
const offeredEth = 500000;
const wantedShares = 500000;
const sellQuantity = 1000;
const buyQuantity = 1000;

test.before(async () => {
  deployed = await deployEnvironment(environment);
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  opts = { from: deployer, gas: config.gas, gasPrice: config.gasPrice };
  version = await deployed.Version;
  mlnToken = await deployed.MlnToken;
  ethToken = await deployed.EthToken;
  maliciousToken = await deployContract("testing/MaliciousToken", opts, [18]);
  await deployed.MatchingMarket.methods.addTokenPairWhitelist(ethToken.options.address, maliciousToken.options.address).send(
    opts,
  );

  await governanceAction(
    opts, deployed.Governance, deployed.CanonicalPriceFeed, 'registerAsset',
    [
      maliciousToken.options.address, web3.utils.toHex('MaliciousToken'), web3.utils.toHex('MAL'), 18, '',
      mockBytes, [mockAddress, mockAddress], [], []
    ]
  );
  // give investor some Eth to use
  await ethToken.methods.transfer(investor, initialEth).send(
    opts
  );

  const [r, s, v] = await getTermsSignatureParameters(manager);
  await version.methods.setupFund(
    web3.utils.toHex("Fund"), // same name as before
    ethToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.MatchingMarket.options.address],
    [],
    v,
    r,
    s,
  ).send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice }
  );
  const fundAddress = await version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.methods.changeCompetitionAddress(investor).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );
});

test.serial("initial investment with ETH", async t => {
  await updateKyberPriceFeed(deployed, {
    [deployed.MlnToken.options.address]: 10 ** 18,
    [maliciousToken.options.address]: 10 ** 18,
    [deployed.EurToken.options.address]: 10 ** 18,
  });
  await ethToken.methods.approve(fund.options.address, offeredEth).send(
    { from: investor, gasPrice: config.gasPrice, gas: config.gas }
  );
  await fund.methods.requestInvestment(offeredEth, wantedShares, ethToken.options.address).send(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice }
  );
  const requestId = await fund.methods.getLastRequestId().call();
  await fund.methods.executeRequest(requestId).send(
    { from: investor, gas: config.gas, gasPrice: config.gasPrice }
  );
  const ownedShares = Number(
    await fund.methods.balanceOf(investor).call(),
  );

  t.deepEqual(ownedShares, wantedShares);
});

test.serial("fund buys some mlnToken", async t => {
  await updateKyberPriceFeed(deployed, {
    [deployed.MlnToken.options.address]: 10 ** 18,
    [maliciousToken.options.address]: 10 ** 18,
    [deployed.EthToken.options.address]: 10 ** 18,
    [deployed.EurToken.options.address]: 10 ** 18,
  });
  await fund.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", ethToken.options.address, mlnToken.options.address, "0x0"],
    [sellQuantity, buyQuantity, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  );
  const orderId = await deployed.MatchingMarket.methods.last_offer_id().call();
  await mlnToken.methods.approve(deployed.MatchingMarket.options.address, buyQuantity).send(
    { from: deployer, gasPrice: config.gasPrice }
  );

  // third party takes order
  await deployed.MatchingMarket.methods.buy(orderId, sellQuantity).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );

  const mlnBalance = Number(
    await mlnToken.methods.balanceOf(fund.options.address).call(),
  );

  t.is(mlnBalance, buyQuantity);
});

test.serial("fund buys some MaliciousToken", async t => {
  await fund.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", ethToken.options.address, maliciousToken.options.address, "0x0"],
    [sellQuantity, buyQuantity, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  );
  const orderId = await deployed.MatchingMarket.methods.last_offer_id().call();
  await maliciousToken.methods.approve(deployed.MatchingMarket.options.address, buyQuantity + 100).send(
    { from: deployer, gasPrice: config.gasPrice }
  );

  // third party takes order
  await deployed.MatchingMarket.methods.buy(orderId, sellQuantity).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );

  const maliciousBalance = Number(
    await maliciousToken.methods.balanceOf(fund.options.address).call(),
  );

  t.is(maliciousBalance, buyQuantity);
});

test.serial("MaliciousToken becomes malicious", async t => {
  await maliciousToken.methods.startThrowing().send();

  const isThrowing = await maliciousToken.methods.isThrowing().call();
  t.true(isThrowing);
});

test.serial("Cannot pass asset multiple times in emergencyRedeem", async t => {
  const preShareQuantity = await fund.methods.balanceOf(investor).call();
  const preMlnQuantity = await mlnToken.methods.balanceOf(investor).call();
  const preEthTokenQuantity = await deployed.EthToken.methods.balanceOf(investor).call();
  await t.throws(fund.methods.emergencyRedeem(preShareQuantity, [mlnToken.options.address, mlnToken.options.address, deployed.EthToken.options.address]).send(
    { from: investor, gas: 6000000 }
  ));
  const postShareQuantity = await fund.methods.balanceOf(investor).call();
  const postMlnQuantity = await mlnToken.methods.balanceOf(investor).call();
  const postEthTokenQuantity = await deployed.EthToken.methods.balanceOf(investor).call();

  t.is(Number(preShareQuantity), Number(postShareQuantity));
  t.is(Number(preMlnQuantity), Number(postMlnQuantity));
  t.is(Number(preEthTokenQuantity), Number(postEthTokenQuantity));
});
