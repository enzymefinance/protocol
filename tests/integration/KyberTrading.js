/* eslint-disable */
import test from "ava";
import web3 from "../../utils/lib/web3";
import deployEnvironment from "../../utils/deploy/contracts";
import getAllBalances from "../../utils/lib/getAllBalances";
import {getSignatureParameters, getTermsSignatureParameters} from "../../utils/lib/signing";
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

function bytesToHex(byteArray) {
    let strNum = toHexString(byteArray);
    let num = '0x' + strNum;
    return num;
};

function toHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
};

test.before(async () => {
  accounts = await web3.eth.getAccounts();
  opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice };
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
  deployed.KyberNetwork.methods.addReserve(deployed.KyberReserve.options.address, true).send();
  deployed.KyberReserve.methods.approveWithdrawAddress(deployed.TokenA.options.address, accounts[0], true).send();

  // Set pricing for Token
  deployed.TokenA.methods.transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 22)).send();
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
  /*compactBuyArr = [0, 0, 0, 0, 0, 0o6, 0x07, 0x08, 0x09, 1, 0, 11, 12, 13, 14];
  let compactBuyHex = "0x00000000000607080901000b0c0d0e";
  console.log(compactBuyHex);
  buys.push(compactBuyHex);

  compactSellArr = [0, 0, 0, 0, 0, 26, 27, 28, 29, 30, 31, 32, 33, 34];
  let compactSellHex = "0x00000000001a1b1c1d1e1f202122";
  console.log(compactSellHex);
  sells.push(compactSellHex);
  indices[0] = 0;
  await deployed.ConversionRates.methods.setCompactData(buys, sells, currentBlock, indices).send();
  */
  await deployed.ConversionRates.methods.setQtyStepFunction(deployed.TokenA.options.address, [0], [0], [0], [0]).send();
  await deployed.ConversionRates.methods.setImbalanceStepFunction(deployed.TokenA.options.address, [0], [0], [0], [0]).send();
  console.log('So FAR SO GOOD');

  deployed.KyberWhiteList = await deployContract(
    "KyberWhitelist",
    opts,
    [accounts[0], deployed.KGTToken.options.address]
  );
  await deployed.KyberWhiteList.methods.addOperator(accounts[0]).send();
  await deployed.KyberWhiteList.methods.setCategoryCap(0, 1000).send();
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

  await deployed.KyberNetwork.methods.setWhiteList(deployed.KyberWhiteList.options.address).send();
  await deployed.KyberNetwork.methods.setExpectedRate(deployed.ExpectedRate.options.address).send();
  await deployed.KyberNetwork.methods.setFeeBurner(deployed.FeeBurner.options.address).send();
  await deployed.KyberNetwork.methods.setKyberProxy(accounts[0]).send();
  await deployed.KyberNetwork.methods.setEnable(true).send();

  await deployed.KyberNetwork.methods.listPairForReserve(deployed.KyberReserve.options.address, deployed.TokenA.options.address, true, true, true).send();

  //console.log(await deployed.ConversionRates.methods.getTokenBasicData(deployed.TokenA.options.address).call());
  console.log(await deployed.ConversionRates.methods.getBasicRate(deployed.TokenA.options.address, true).call());
  console.log(await deployed.ConversionRates.methods.getRate(deployed.TokenA.options.address, currentBlock, false, new BigNumber(10 ** 19)).call());
  console.log(await deployed.KyberReserve.methods.getBalance(deployed.TokenA.options.address).call());
  console.log(await deployed.KyberReserve.methods.getConversionRate(ethAddress, deployed.TokenA.options.address, new BigNumber(10 ** 19), currentBlock).call());
  console.log(await deployed.KyberNetwork.methods.getExpectedRate(ethAddress, deployed.TokenA.options.address, 100).call());
});

test.beforeEach(async () => {

});

test.serial("test", async t => {
  t.true(true);
});
