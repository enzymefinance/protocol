import api from "./api";
import governanceAction from "./governanceAction";

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

// TODO: make this more dynamic (different tokens) and flexible, so it can be imported by other projects like our updater
async function getConvertedPrices(deployed) {
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
  return {
    [deployed.EthToken.address]: convertedEth,
    [deployed.EurToken.address]: convertedEur,
    [deployed.MlnToken.address]: convertedMln
  };
}

/**
 * Deploy a contract, and get back an instance.
 * NB: Deprecating this functrion when we get rid of regular (non-canonical) pricefeed
 * @param {Object} deployed - Object of deployed contracts from deployment script
 * @param {Object} inputPrices - Optional object of asset addresses (keys) and prices (values)
 */
async function updatePriceFeed(deployed, inputPrices = {}) {
  let prices;
  const accounts = await api.eth.accounts();
  if(Object.keys(inputPrices).length === 0) {
    prices = await getConvertedPrices(deployed);
  } else {
    prices = inputPrices;
  }
  await deployed.PriceFeed.instance.update.postTransaction(
    { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice },
    [Object.keys(prices), Object.values(prices)]
  );
}

/**
 * Deploy a contract, and get back an instance.
 * NB: Deprecating this functrion when we get rid of regular (non-canonical) pricefeed
 * @param {Object} deployed - Object of deployed contracts from deployment script
 * @param {Object} inputPrices - Optional object of asset addresses (keys) and prices (values)
 */
async function updateCanonicalPriceFeed(deployed, inputPrices = {}) {
  let prices;
  const accounts = await api.eth.accounts();
  if(Object.keys(inputPrices).length === 0) {
    prices = await getConvertedPrices(deployed);
  } else {
    prices = inputPrices;
  }
  let txid = await deployed.SimplePriceFeed.instance.update.postTransaction(
    { from: accounts[0], gas: config.gas, gasPrice: config.gasPrice },
    [Object.keys(prices), Object.values(prices)]
  );
  await governanceAction(
    {from: accounts[0]},
    deployed.Governance, deployed.CanonicalPriceFeed, 'collectAndUpdate',
    [Object.keys(prices)]
  );
}

export { updatePriceFeed, updateCanonicalPriceFeed };
