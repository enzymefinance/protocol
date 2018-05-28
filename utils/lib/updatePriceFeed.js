import api from "./api";
import governanceAction from "../../utils/lib/governanceAction";

const BigNumber = require("bignumber.js");
const environmentConfig = require("../config/environment.js");
const rp = require("request-promise");

const environment = "development";
const config = environmentConfig[environment];

const apiPath = "https://min-api.cryptocompare.com/data/price";

const tokenInfo = require("../../utils/info/tokenInfo.js"); // get decimals from info file

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
/**
 * Get prices converted to the format our contracts expect
 * @param {Object} deployed - Contracts as returned by our deploy script
 * @param {string} fromSymbol - Quote asset symbol, used to price other assets
 */
async function getConvertedPrices(deployed, fromSymbol) {
  const toSymbols = ['MLN', 'EUR', 'ETH'];
  const options = {
    uri: `${apiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(',')}&sign=true`,
    json: true
  }
  const queryResult = await requestWithRetries(options, 3);
  if(queryResult[fromSymbol] !== 1) {
    throw new Error(`API call returned incorrect price for ${fromSymbol}`);
  } else if(Object.values(queryResult).indexOf(0) !== -1) {
    throw new Error('API call returned a zero price');
  }
  let fromTokenSymbol;
  if (fromSymbol === 'ETH') {
    fromTokenSymbol = 'WETH';   // special case for ETH, since WETH does not have a price in api
  } else {
    fromTokenSymbol = fromSymbol;
  }
  const quoteDecimals = tokenInfo.live[fromTokenSymbol].decimals;
  const ethDecimals = tokenInfo.live['WETH'].decimals;
  const eurDecimals = tokenInfo.kovan['EUR-T'].decimals;
  const mlnDecimals = tokenInfo.live['MLN'].decimals;
  const inverseEth = new BigNumber(1).div(new BigNumber(queryResult.ETH)).toNumber().toFixed(15);
  const inverseEur = new BigNumber(1).div(new BigNumber(queryResult.EUR)).toNumber().toFixed(15);
  const inverseMln = new BigNumber(1).div(new BigNumber(queryResult.MLN)).toNumber().toFixed(15);
  const convertedEth = new BigNumber(inverseEth).div(10 ** (ethDecimals - quoteDecimals)).times(10 ** ethDecimals);
  const convertedEur = new BigNumber(inverseEur).div(10 ** (eurDecimals - quoteDecimals)).times(10 ** eurDecimals);
  const convertedMln = new BigNumber(inverseMln).div(10 ** (mlnDecimals - quoteDecimals)).times(10 ** mlnDecimals);
  return {
    [deployed.EurToken.address]: convertedEur,
    [deployed.EthToken.address]: convertedEth,
    [deployed.MlnToken.address]: convertedMln,
  };
}

/**
 * Deploy a contract, and get back an instance.
 * NB: Deprecating this functrion when we get rid of regular (non-canonical) pricefeed
 * @param {Object} deployed - Object of deployed contracts from deployment script
 * @param {Object} inputPrices - Optional object of asset addresses (keys) and prices (values)
 */
async function updatePriceFeed(deployed, inputPrices = {}, quoteSymbol = 'ETH') {
  let prices;
  const accounts = await api.eth.accounts();
  if(Object.keys(inputPrices).length === 0) {
    prices = await getConvertedPrices(deployed, quoteSymbol);
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
 * @param {string} quoteSymbol - Symbol for quote asset
 */
async function updateCanonicalPriceFeed(deployed, inputPrices = {}, quoteSymbol = 'ETH') {
  let prices;
  const accounts = await api.eth.accounts();
  if(Object.keys(inputPrices).length === 0) {
    prices = await getConvertedPrices(deployed, quoteSymbol);
  } else {
    prices = inputPrices;
  }
  await deployed.StakingPriceFeed.instance.update.postTransaction(
    { from: accounts[0], gas: config.gas },
    [Object.keys(prices), Object.values(prices)]
  );
  let assetList = await deployed.CanonicalPriceFeed.instance.getRegisteredAssets.call();
  assetList = assetList.map(e => e._value);
  await governanceAction({from: accounts[0]}, deployed.Governance, deployed.CanonicalPriceFeed, "collectAndUpdate", [assetList]);
}

export { updatePriceFeed, updateCanonicalPriceFeed };
