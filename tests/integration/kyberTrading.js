import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import { getTermsSignatureParameters} from "../../utils/lib/signing";
import { makeOrderSignature } from "../../utils/lib/data";
import {updateCanonicalPriceFeed} from "../../utils/lib/updatePriceFeed";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import governanceAction from "../../utils/lib/governanceAction";

const environmentConfig = require("../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = "development";
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployed = {};
let opts;
let mlnPrice;

const minimalRecordResolution = 2;
const maxPerBlockImbalance = new BigNumber(10 ** 29);
const validRateDurationInBlocks = 5100;
const precisionUnits = (new BigNumber(10).pow(18));
const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const maxTotalImbalance = maxPerBlockImbalance.mul(12);

// base buy and sell rates (prices)
const baseBuyRate1 = [];
const baseSellRate1 = [];

// compact data.
const sells = [];
const buys = [];
const indices = [];

let deployer;
let manager;
let investor;
let fund;
let ethToken;
let mlnToken;

test.before(async () => {
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice };
  deployed = await deployEnvironment(environment);

  // Setup Kyber env
  deployed.ConversionRates = await deployContract(
    "ConversionRates",
    opts,
    [accounts[0]]
  );
  ethToken = deployed.EthToken;
  mlnToken = deployed.MlnToken;
  deployed.KGTToken = await deployContract("TestToken", opts, ["KGT", "KGT", 18]);
  await deployed.ConversionRates.methods.setValidRateDurationInBlocks(validRateDurationInBlocks).send();
  await deployed.ConversionRates.methods.addToken(mlnToken.options.address).send();
  await deployed.ConversionRates.methods.setTokenControlInfo(mlnToken.options.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance).send();
  await deployed.ConversionRates.methods.enableTokenTrade(mlnToken.options.address).send();
  deployed.KyberNetwork = await deployContract(
    "KyberNetwork",
    opts,
    [accounts[0]]
  );
  deployed.KyberReserve = await deployContract(
    "KyberReserve",
    opts,
    [deployed.KyberNetwork.options.address, deployed.ConversionRates.options.address, accounts[0]]
  );
  await deployed.ConversionRates.methods.setReserveAddress(deployed.KyberReserve.options.address).send();
  await deployed.KyberNetwork.methods.addReserve(deployed.KyberReserve.options.address, true).send();
  await deployed.KyberReserve.methods.approveWithdrawAddress(mlnToken.options.address, accounts[0], true).send();
  await deployed.KyberReserve.methods.enableTrade().send();
  await deployed.KyberReserve.methods.setTokenWallet(mlnToken.options.address, accounts[0]).send();
  await mlnToken.methods.approve(deployed.KyberReserve.options.address, new BigNumber(10 ** 26)).send();

  // Set pricing for Token
  await mlnToken.methods.transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 26)).send();
  await updateCanonicalPriceFeed(deployed);
  [mlnPrice] =
    Object.values(await deployed.CanonicalPriceFeed.methods.getPrice(mlnToken.options.address).call()).map(e => new BigNumber(e).toFixed(0));
  const ethersPerToken = mlnPrice;
  const tokensPerEther = precisionUnits.mul(precisionUnits).div(ethersPerToken).toFixed(0);
  baseBuyRate1.push(tokensPerEther);
  baseSellRate1.push(ethersPerToken);
  const currentBlock = await web3.eth.getBlockNumber();
  await deployed.ConversionRates.methods.addOperator(accounts[0]).send();
  await deployed.ConversionRates.methods.setBaseRate([mlnToken.options.address], baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices).send();
  await deployed.ConversionRates.methods.setQtyStepFunction(mlnToken.options.address, [0], [0], [0], [0]).send();
  await deployed.ConversionRates.methods.setImbalanceStepFunction(mlnToken.options.address, [0], [0], [0], [0]).send();

  deployed.KyberWhiteList = await deployContract(
    "KyberWhitelist",
    opts,
    [accounts[0], deployed.KGTToken.options.address]
  );
  await deployed.KyberWhiteList.methods.addOperator(accounts[0]).send();
  await deployed.KyberWhiteList.methods.setCategoryCap(0, new BigNumber(10 ** 28)).send();
  await deployed.KyberWhiteList.methods.setSgdToEthRate(30000).send();

  deployed.FeeBurner = await deployContract(
    "FeeBurner",
    opts,
    [accounts[0], mlnToken.options.address, deployed.KyberNetwork.options.address]
  );
  deployed.ExpectedRate = await deployContract(
    "ExpectedRate",
    opts,
    [deployed.KyberNetwork.options.address, accounts[0]]
  );

  deployed.KyberNetworkProxy = await deployContract(
    "KyberNetworkProxy",
    opts,
    [accounts[0]]
  );

  await web3.eth.sendTransaction({to: deployed.KyberReserve.options.address, from: accounts[0], value: new BigNumber(10 ** 25)});
  await deployed.KyberReserve.methods.setContracts(deployed.KyberNetwork.options.address, deployed.ConversionRates.options.address, 0).send();
  await deployed.KyberNetworkProxy.methods.setKyberNetworkContract(deployed.KyberNetwork.options.address).send();
  await deployed.KyberNetwork.methods.setWhiteList(deployed.KyberWhiteList.options.address).send();
  await deployed.KyberNetwork.methods.setExpectedRate(deployed.ExpectedRate.options.address).send();
  await deployed.KyberNetwork.methods.setFeeBurner(deployed.FeeBurner.options.address).send();
  await deployed.KyberNetwork.methods.setKyberProxy(deployed.KyberNetworkProxy.options.address).send();
  await deployed.KyberNetwork.methods.setEnable(true).send();
  await deployed.KyberNetwork.methods.listPairForReserve(deployed.KyberReserve.options.address, mlnToken.options.address, true, true, true).send();

  // console.log(await deployed.ConversionRates.methods.getRate(mlnToken.options.address, currentBlock, false, new BigNumber(10 ** 25)).call());
  // console.log(await deployed.KyberReserve.methods.getBalance(mlnToken.options.address).call());
  // console.log(await deployed.KyberReserve.methods.getConversionRate(ethAddress, mlnToken.options.address, new BigNumber(10 ** 23), currentBlock).call());

  // Melon Fund env
  deployed.KyberAdapter = await deployContract(
    "exchange/adapter/KyberAdapter", opts
  );
  await governanceAction(
    { from: accounts[0] },
    deployed.Governance,
    deployed.CanonicalPriceFeed,
    "registerExchange",
    [
      deployed.KyberNetworkProxy.options.address,
      deployed.KyberAdapter.options.address,
      true,
      [makeOrderSignature],
    ],
  );
  const [r, s, v] = await getTermsSignatureParameters(manager);
  await deployed.Version.methods.setupFund(
    web3.utils.toHex("Suisse Fund"),
    deployed.EthToken.options.address, // base asset
    config.protocol.fund.managementFee,
    config.protocol.fund.performanceFee,
    deployed.NoCompliance.options.address,
    deployed.RMMakeOrders.options.address,
    [deployed.KyberNetworkProxy.options.address],
    [],
    v,
    r,
    s,
  ).send(
    { from: manager, gas: config.gas, gasPrice: config.gasPrice }
  );
  const fundAddress = await deployed.Version.methods.managerToFunds(manager).call();
  fund = await retrieveContract("Fund", fundAddress);
  // Change competition.options.address to investor just for testing purpose so it allows invest / redeem
  await deployed.CompetitionCompliance.methods.changeCompetitionAddress(investor).send(
    { from: deployer, gas: config.gas, gasPrice: config.gasPrice }
  );
});

const initialTokenAmount = new BigNumber(10 ** 20);
test.serial("investor receives initial ethToken for testing", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  await ethToken.methods.transfer(investor, initialTokenAmount).send(
    { from: deployer, gasPrice: config.gasPrice }
  );
  const post = await getAllBalances(deployed, accounts, fund);

  t.deepEqual(
    post.investor.EthToken,
    new BigNumber(pre.investor.EthToken).add(initialTokenAmount),
  );
});

// mock data
const offeredValue = new BigNumber(10 ** 20);
const wantedShares = new BigNumber(10 ** 20);
test.serial(
  "fund receives ETH from a investment (request & execute)",
  async t => {
    const pre = await getAllBalances(deployed, accounts, fund);
    await ethToken.methods.approve(fund.options.address, offeredValue).send(
      { from: investor, gasPrice: config.gasPrice, gas: config.gas }
    );
    await fund.methods.requestInvestment(offeredValue, wantedShares, ethToken.options.address).send(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice }
    );
    const requestId = await fund.methods.getLastRequestId().call();
    await fund.methods.executeRequest(requestId).send(
      { from: investor, gas: config.gas, gasPrice: config.gasPrice }
    );
    const post = await getAllBalances(deployed, accounts, fund);

    t.deepEqual(
      post.investor.EthToken,
      pre.investor.EthToken.minus(offeredValue),
    );
    t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(offeredValue));
    t.deepEqual(post.fund.ether, pre.fund.ether);
  },
);

/*
test.skip("test", async t => {
   // await deployed.KyberReserve.methods.setContracts(accounts[0], deployed.ConversionRates.options.address, 0).send();
   // await deployed.KyberReserve.methods.trade(ethAddress, new BigNumber(10 ** 16), mlnToken.options.address, accounts[0], new BigNumber(10 ** 17), false).send({from: accounts[0], gasPrice: 1, value: new BigNumber(10 ** 16)});
   console.log(await deployed.KyberNetworkProxy.methods.getUserCapInWei(accounts[2]).call());
   console.log(await deployed.KyberNetwork.methods.findBestRate(ethAddress, mlnToken.options.address, new BigNumber(10 ** 23)).call());
  // await deployed.KyberNetworkProxy.methods.trade(ethAddress, new BigNumber(10 ** 17), mlnToken.options.address, accounts[2], new BigNumber(10 ** 28), 0, accounts[2]).send();
   await deployed.KyberNetworkProxy.methods.swapEtherToToken(mlnToken.options.address, 1).send({from: accounts[2], gasPrice: 1, value: new BigNumber(10 ** 18)});
});
*/

test.serial("make order with ethToken as makerAsset", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const makerQuantity = new  BigNumber(10 ** 17);
  const [, bestRate] = Object.values(await deployed.KyberNetwork.methods.findBestRate(ethAddress, mlnToken.options.address, makerQuantity).call()).map(e => new BigNumber(e));
  await fund.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", ethToken.options.address, mlnToken.options.address, "0x0"],
    [makerQuantity, 0, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  );
  const expectedMln = makerQuantity.mul(bestRate).div(new BigNumber(10 ** 18));
  const post = await getAllBalances(deployed, accounts, fund);
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.sub(makerQuantity));
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.add(expectedMln));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
});

test.serial("make order with mlnToken as makerAsset", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const makerQuantity = new  BigNumber(10 ** 17);
  const [, bestRate] = Object.values(await deployed.KyberNetwork.methods.findBestRate(mlnToken.options.address, ethAddress, makerQuantity).call()).map(e => new BigNumber(e));
  await fund.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", mlnToken.options.address, ethToken.options.address, "0x0"],
    [makerQuantity, 0, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  );
  const expectedEthToken = makerQuantity.mul(bestRate).div(new BigNumber(10 ** 18));
  const post = await getAllBalances(deployed, accounts, fund);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.sub(makerQuantity));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(expectedEthToken));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
});

// minPrice is basically set if takerQuantity is non-zero (Otherwise it's just executes at market price)
test.serial("make order with specific order price (minRate)", async t => {
  const pre = await getAllBalances(deployed, accounts, fund);
  const makerQuantity = new  BigNumber(10 ** 17);
  const takerQuantity = makerQuantity.mul(mlnPrice).div(precisionUnits);
  const [, bestRate] = Object.values(await deployed.KyberNetwork.methods.findBestRate(mlnToken.options.address, ethAddress, makerQuantity).call()).map(e => new BigNumber(e));
  await fund.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", mlnToken.options.address, ethToken.options.address, "0x0"],
    [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  );
  const expectedEthToken = makerQuantity.mul(bestRate).div(new BigNumber(10 ** 18));
  const post = await getAllBalances(deployed, accounts, fund);
  t.deepEqual(post.fund.MlnToken, pre.fund.MlnToken.sub(makerQuantity));
  t.deepEqual(post.fund.EthToken, pre.fund.EthToken.add(expectedEthToken));
  t.deepEqual(post.investor.MlnToken, pre.investor.MlnToken);
  t.deepEqual(post.investor.EthToken, pre.investor.EthToken);
  t.deepEqual(post.investor.ether, pre.investor.ether);
  t.deepEqual(post.manager.EthToken, pre.manager.EthToken);
  t.deepEqual(post.manager.MlnToken, pre.manager.MlnToken);
});


test.serial("make order fails if minPrice is not satisfied", async t => {
  const makerQuantity = new  BigNumber(10 ** 17);
  const takerQuantity = makerQuantity.mul(mlnPrice * 2).div(precisionUnits);
  await t.throws(fund.methods.callOnExchange(
    0,
    makeOrderSignature,
    ["0x0", "0x0", mlnToken.options.address, ethToken.options.address, "0x0"],
    [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
    web3.utils.padLeft('0x0', 64),
    0,
    web3.utils.padLeft('0x0', 64),
    web3.utils.padLeft('0x0', 64),
  ).send(
    { from: manager, gas: config.gas }
  ));
});
