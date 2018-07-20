/* eslint-disable */
import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import {getSignatureParameters, getTermsSignatureParameters} from "../../utils/lib/signing";
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
let minimalRecordResolution = 2;
let maxPerBlockImbalance = new BigNumber(10 ** 21);
let validRateDurationInBlocks = 5100;
let precisionUnits = (new BigNumber(10).pow(18));
let ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
let maxTotalImbalance = maxPerBlockImbalance.mul(12);

//base buy and sell rates (prices)
let baseBuyRate1 = [];
let baseBuyRate2 = [];
let baseSellRate1 = [];
let baseSellRate2 = [];

//compact data.
let sells = [];
let buys = [];
let indices = [];
let compactBuyArr = [];
let compactSellArr = [];

//quantity buy steps
let qtyBuyStepX = [0, 150, 350, 700,  1400];
let qtyBuyStepY = [0,  0, -70, -160, -3000];

//imbalance buy steps
let imbalanceBuyStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
let imbalanceBuyStepY = [ 1300,   130,    43, 0,   0, -110, -1600];

//sell
//sell price will be 1 / buy (assuming no spread) so sell is actually buy price in other direction
let qtySellStepX = [0, 150, 350, 700, 1400];
let qtySellStepY = [0,   0, 120, 170, 3000];

//sell imbalance step
let imbalanceSellStepX = [-8500, -2800, -1500, 0, 1500, 2800,  4500];
let imbalanceSellStepY = [-1500,  -320,   -75, 0,    0,  110,   650];

let deployer;
let manager;
let investor;
let fund;
let ethToken;

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
  deployed.TokenA = await deployContract("TestToken", opts, ["Test", "T1", 18]);
  deployed.KGTToken = await deployContract("TestToken", opts, ["KGT", "KGT", 18]);
  await deployed.ConversionRates.methods.setValidRateDurationInBlocks(validRateDurationInBlocks).send();
  await deployed.ConversionRates.methods.addToken(deployed.TokenA.options.address).send();
  await deployed.ConversionRates.methods.setTokenControlInfo(deployed.TokenA.options.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance).send();
  await deployed.ConversionRates.methods.enableTokenTrade(deployed.TokenA.options.address).send();
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
  await deployed.KyberReserve.methods.approveWithdrawAddress(deployed.TokenA.options.address, accounts[0], true).send();
  await deployed.KyberReserve.methods.enableTrade().send();
  await deployed.KyberReserve.methods.setTokenWallet(deployed.TokenA.options.address, accounts[0]).send();
  await deployed.TokenA.methods.approve(deployed.KyberReserve.options.address, new BigNumber(10 ** 25)).send();

  // Set pricing for Token
  await deployed.TokenA.methods.transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 22)).send();
  const tokensPerEther = (new BigNumber(precisionUnits.mul(2 * 3)).floor());
  const ethersPerToken = (new BigNumber(precisionUnits.div(2 * 3)).floor());
  baseBuyRate1.push(tokensPerEther.valueOf());
  baseBuyRate2.push(tokensPerEther.valueOf() * 10100 / 10000);
  baseSellRate1.push(ethersPerToken.valueOf());
  baseSellRate2.push(ethersPerToken.div(1000).mul(980));
  const currentBlock = await web3.eth.getBlockNumber();
  await deployed.ConversionRates.methods.addOperator(accounts[0]).send();
  await deployed.ConversionRates.methods.setBaseRate([deployed.TokenA.options.address], baseBuyRate1, baseSellRate1, buys, sells, currentBlock, indices).send();
  const updateRateBlock = await web3.eth.getBlockNumber();
  await deployed.ConversionRates.methods.setQtyStepFunction(deployed.TokenA.options.address, [0], [0], [0], [0]).send();
  await deployed.ConversionRates.methods.setImbalanceStepFunction(deployed.TokenA.options.address, [0], [0], [0], [0]).send();

  deployed.KyberWhiteList = await deployContract(
    "KyberWhitelist",
    opts,
    [accounts[0], deployed.KGTToken.options.address]
  );
  await deployed.KyberWhiteList.methods.addOperator(accounts[0]).send();
  await deployed.KyberWhiteList.methods.setCategoryCap(0, new BigNumber(10 * 28)).send();
  await deployed.KyberWhiteList.methods.setSgdToEthRate(30000).send();

  deployed.FeeBurner = await deployContract(
    "FeeBurner",
    opts,
    [accounts[0], deployed.TokenA.options.address, deployed.KyberNetwork.options.address]
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
  await deployed.KyberReserve.methods.setContracts(deployed.KyberNetwork.options.address, deployed.ConversionRates.options.address, 0).send();
  await deployed.KyberNetworkProxy.methods.setKyberNetworkContract(deployed.KyberNetwork.options.address).send();
  await deployed.KyberNetwork.methods.setWhiteList(deployed.KyberWhiteList.options.address).send();
  await deployed.KyberNetwork.methods.setExpectedRate(deployed.ExpectedRate.options.address).send();
  await deployed.KyberNetwork.methods.setFeeBurner(deployed.FeeBurner.options.address).send();
  await deployed.KyberNetwork.methods.setKyberProxy(deployed.KyberNetworkProxy.options.address).send();
  await deployed.KyberNetwork.methods.setEnable(true).send();
  await deployed.KyberNetwork.methods.listPairForReserve(deployed.KyberReserve.options.address, deployed.TokenA.options.address, true, true, true).send();

  console.log(await deployed.ConversionRates.methods.getTokenBasicData(deployed.TokenA.options.address).call());
  console.log(await deployed.ConversionRates.methods.getBasicRate(deployed.TokenA.options.address, true).call());
  console.log(await deployed.ConversionRates.methods.getRate(deployed.TokenA.options.address, currentBlock, false, new BigNumber(10 ** 19)).call());
  console.log(await deployed.KyberReserve.methods.getBalance(deployed.TokenA.options.address).call());
  console.log(await deployed.KyberReserve.methods.getConversionRate(ethAddress, deployed.TokenA.options.address, new BigNumber(10 ** 19), currentBlock).call());
  console.log(await deployed.KyberNetwork.methods.getExpectedRate(ethAddress, deployed.TokenA.options.address, 100).call());

  // Melon Fund env
  ethToken = deployed.EthToken;
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

test.beforeEach(async () => {

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
const offeredValue = new BigNumber(10 ** 10);
const wantedShares = new BigNumber(10 ** 10);
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
    await updateCanonicalPriceFeed(deployed);
    await updateCanonicalPriceFeed(deployed);
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

test.serial("test", async t => {
   // await deployed.KyberReserve.methods.setContracts(accounts[0], deployed.ConversionRates.options.address, 0).send();
   // await deployed.KyberReserve.methods.trade(ethAddress, new BigNumber(10 ** 16), deployed.TokenA.options.address, accounts[0], new BigNumber(10 ** 17), false).send({from: accounts[0], gasPrice: 1, value: new BigNumber(10 ** 16)});
   console.log(await deployed.KyberNetwork.methods.isEnabled().call());
   console.log(await deployed.KyberNetwork.methods.findBestRate(ethAddress, deployed.TokenA.options.address, 100).call());
  // await deployed.KyberNetworkProxy.methods.trade(ethAddress, new BigNumber(10 ** 17), deployed.TokenA.options.address, accounts[2], new BigNumber(10 ** 28), 0, accounts[2]).send();
   //await deployed.KyberNetworkProxy.methods.swapEtherToToken(deployed.TokenA.options.address, 1).send({from: accounts[0], gasPrice: 1, value: new BigNumber(10 ** 16)});
});
