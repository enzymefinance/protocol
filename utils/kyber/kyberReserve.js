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
let baseBuyRate1 = [];
let baseSellRate1 = [];

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
let eurToken;

async function setupReserve() {
  accounts = await web3.eth.getAccounts();
  [deployer, manager, investor] = accounts;
  opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice };

  // Setup Kyber env
  deployed.ConversionRates = await deployContract(
    "exchange/thirdparty/kyber/ConversionRates",
    opts,
    [accounts[0]]
  );
  ethToken = deployed.EthToken;
  mlnToken = deployed.MlnToken;
  eurToken = deployed.EurToken;
  deployed.KGTToken = await deployContract("exchange/thirdparty/kyber/TestToken", opts, ["KGT", "KGT", 18]);
  await deployed.ConversionRates.methods.setValidRateDurationInBlocks(validRateDurationInBlocks).send();
  await deployed.ConversionRates.methods.addToken(mlnToken.options.address).send();
  await deployed.ConversionRates.methods.setTokenControlInfo(mlnToken.options.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance).send();
  await deployed.ConversionRates.methods.enableTokenTrade(mlnToken.options.address).send();
  deployed.KyberNetwork = await deployContract(
    "exchange/thirdparty/kyber/KyberNetwork",
    opts,
    [accounts[0]]
  );
  deployed.KyberReserve = await deployContract(
    "exchange/thirdparty/kyber/KyberReserve",
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
    "exchange/thirdparty/kyber/KyberWhitelist",
    opts,
    [accounts[0], deployed.KGTToken.options.address]
  );
  await deployed.KyberWhiteList.methods.addOperator(accounts[0]).send();
  await deployed.KyberWhiteList.methods.setCategoryCap(0, new BigNumber(10 ** 28)).send();
  await deployed.KyberWhiteList.methods.setSgdToEthRate(30000).send();

  deployed.FeeBurner = await deployContract(
    "exchange/thirdparty/kyber/FeeBurner",
    opts,
    [accounts[0], mlnToken.options.address, deployed.KyberNetwork.options.address]
  );
  deployed.ExpectedRate = await deployContract(
    "exchange/thirdparty/kyber/ExpectedRate",
    opts,
    [deployed.KyberNetwork.options.address, accounts[0]]
  );

  deployed.KyberNetworkProxy = await deployContract(
    "exchange/thirdparty/kyber/KyberNetworkProxy",
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
}

setupReserve();
