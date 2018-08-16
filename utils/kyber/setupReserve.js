import web3 from "../../utils/lib/web3";
import {deployContract, retrieveContract} from "../../utils/lib/contracts";
import  {bytesToHex} from "./utils";
import  updateReservePrices from "./updateReservePrices";

const fs = require("fs");
const environmentConfig = require("../../utils/config/environment.js");
const BigNumber = require("bignumber.js");

const environment = process.env.CHAIN_ENV;
const config = environmentConfig[environment];

// hoisted variables
let accounts;
let deployed = {};
let opts;

const enabledTokens = {};

let deployer;
let mlnToken;

async function setupReserve(configPath) {
  const configJson = JSON.parse(fs.readFileSync(configPath));
  accounts = await web3.eth.getAccounts();
  [deployer] = accounts;
  opts = { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice };

  // Setup Kyber env
  deployed.ConversionRates = await deployContract(
    "exchange/thirdparty/kyber/ConversionRates",
    opts,
    [accounts[0]]
  );
  deployed.KyberReserve = await deployContract(
    "exchange/thirdparty/kyber/KyberReserve",
    opts,
    [configJson.kyberNetworkAddress, deployed.ConversionRates.options.address, accounts[0]]
  );

  console.log('-- Setup Conversion Rates contract --');
  await deployed.ConversionRates.methods.setValidRateDurationInBlocks(configJson.validRateDurationBlocks).send();
  await deployed.ConversionRates.methods.setReserveAddress(deployed.KyberReserve.options.address).send();
  await deployed.ConversionRates.methods.addOperator(accounts[0]).send();
  await deployed.KyberReserve.methods.enableTrade().send();

  console.log('-- Setup tokens in Conversion Rates contract  --');
  /* eslint-disable no-await-in-loop */
  const tokensInfo = configJson.tokens;
  for (const i of Object.keys(tokensInfo)) {
    await deployed.ConversionRates.methods.addToken(tokensInfo[i].address).send();
    await deployed.ConversionRates.methods.setTokenControlInfo(tokensInfo[i].address, tokensInfo[i].minimalRecordResolution, tokensInfo[i].maxPerBlockImbalance, tokensInfo[i].maxTotalImbalance).send();
    await deployed.ConversionRates.methods.enableTokenTrade(tokensInfo[i].address).send();
    enabledTokens[i] = await retrieveContract("assets/Asset", tokensInfo[i].address);
  }

  for (const i of Object.keys(tokensInfo)) {
    await deployed.KyberReserve.methods.approveWithdrawAddress(tokensInfo[i].address, accounts[0], true).send();
    await deployed.KyberReserve.methods.setTokenWallet(tokensInfo[i].address, accounts[0]).send();
    await enabledTokens[i].methods.approve(deployed.KyberReserve.options.address, new BigNumber(10 ** 26)).send({from: accounts[0]});
    await deployed.ConversionRates.methods.setQtyStepFunction(tokensInfo[i].address, [0], [0], [0], [0]).send();
    await deployed.ConversionRates.methods.setImbalanceStepFunction(tokensInfo[i].address, [0], [0], [0], [0]).send();
    if (environment === "development") {
      await enabledTokens[i].methods.transfer(deployed.KyberReserve.options.address, new BigNumber(10 ** 26)).send({from: accounts[0]});
    }
  }

  // Set contracts and send ether if development environment
  await deployed.KyberReserve.methods.setContracts(configJson.kyberNetworkAddress, deployed.ConversionRates.options.address, 0).send();
  if (environment === "development") {
    await web3.eth.sendTransaction({to: deployed.KyberReserve.options.address, from: accounts[0], value: new BigNumber(10 ** 25)});
  }

  configJson.reserveAddress = deployed.KyberReserve.options.address;
  configJson.conversionRatesAddress = deployed.ConversionRates.options.address;
  fs.writeFileSync(configPath, JSON.stringify(configJson, null, 4));
}

export default setupReserve;
