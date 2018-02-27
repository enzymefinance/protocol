import api from "./api";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../config/environment.js");
const rp = require("request-promise");

const environment = "development";
const config = environmentConfig[environment];

const apiPath = "https://min-api.cryptocompare.com/data/price";

// TODO: should we have a separate token config for development network? much of the information is identical
const tokenInfo = require("../../utils/info/tokenInfo.js").kovan;

// retry the request if it fails (helps with bad connections)
async function requestWithRetries(options, maxRetries) {
  if(maxRetries === -1) {
    throw new Error('Request failed. Max retry limit reached.');
  } else {
    try {
      return await rp(options);
    } catch (err) {
      console.error(`Error during request:\n${err.message}`);
      return requestWithRetries(options, maxRetries - 1);
    }
  }
}

// TODO: make this more dynamic (different tokens) and general, so it can be imported by other projects like our updater
export default async function updatePriceFeed (instances) {
  const accounts = await api.eth.accounts();
  const fromSymbol = 'MLN';
  const toSymbols = ['ETH', 'EUR', 'MLN'];
  const options = {
    uri: `${apiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(',')}&sign=true`,
    json: true
  }
  const queryResult = await requestWithRetries(options, 3);
  if(queryResult.MLN !== 1) {
    throw new Error('API call returned incorrect price for MLN');
  } else if(queryResult.ETH === 0 || queryResult.EUR === 0) {
    throw new Error('API call returned a zero price');
  }
  const ethDecimals = tokenInfo.filter(token => token.symbol === 'ETH-T')[0].decimals
  const eurDecimals = tokenInfo.filter(token => token.symbol === 'EUR-T')[0].decimals
  const mlnDecimals = tokenInfo.filter(token => token.symbol === 'MLN-T')[0].decimals
  const inverseEth = new BigNumber(1).div(new BigNumber(queryResult.ETH)).toNumber().toFixed(15);
  const inverseEur = new BigNumber(1).div(new BigNumber(queryResult.EUR)).toNumber().toFixed(15);
  const inverseMln = new BigNumber(1).div(new BigNumber(queryResult.MLN)).toNumber().toFixed(15);
  const convertedEth = new BigNumber(inverseEth).div(10 ** (ethDecimals - mlnDecimals)).times(10 ** ethDecimals);
  const convertedEur = new BigNumber(inverseEur).div(10 ** (eurDecimals - mlnDecimals)).times(10 ** eurDecimals);
  const convertedMln = new BigNumber(inverseMln).div(10 ** (mlnDecimals - mlnDecimals)).times(10 ** mlnDecimals);
  await instances.PriceFeed.instance.update.postTransaction(
    { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice },
    [[instances.EthToken.address, instances.EurToken.address, instances.MlnToken.address],
    [convertedEth, convertedEur, convertedMln]]
  );
}

