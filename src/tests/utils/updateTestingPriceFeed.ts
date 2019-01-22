const BigNumber = require('bignumber.js');
const rp = require('request-promise');

const apiPath = 'https://min-api.cryptocompare.com/data/price';

// retry the request if it fails (helps with bad connections)
async function requestWithRetries(options, maxRetries) {
  if (maxRetries === -1) {
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

function convertPrice(inputPrice) {
  const quoteDecimals = 18; // Hardcoded for now

  return new BigNumber((1 / inputPrice).toFixed(16)).mul(10 ** quoteDecimals);
}

// get token from a list by symbol
function getToken(tokenList, sym) {
  return tokenList.find(e => e.symbol === sym);
}

// TODO: reduce code duplication between this and the other one when we can
// This function gets prices only for assets defined in an environment object
/**
 * Get prices converted to the format our contracts expect
 * @param {Object} env - Environment as used in our deploy scripts
 * @param {string} fromSymbol - Quote asset symbol, used to price other assets
 */
// TODO: Change to BigInteger
export async function getConvertedPrices(env, fromSymbol) {
  const tokens = env.deployment.thirdPartyContracts.tokens;
  const toSymbols = [
    ...(typeof getToken(tokens, 'DGX') !== 'undefined' ? ['DGX'] : []),
    ...(typeof getToken(tokens, 'MLN') !== 'undefined' ? ['MLN'] : []),
    ...(typeof getToken(tokens, 'EUR') !== 'undefined' ? ['EUR'] : []),
    ...(typeof getToken(tokens, 'WETH') !== 'undefined' ? ['ETH'] : []),
  ];
  const options = {
    json: true,
    uri: `${apiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(',')}&sign=true`,
  };
  const queryResult = await requestWithRetries(options, 3);

  if (queryResult[fromSymbol] !== 1) {
    throw new Error(`API call returned incorrect price for ${fromSymbol}`);
  } else if (Object.values(queryResult).indexOf(0) !== -1) {
    throw new Error('API call returned a zero price');
  }

  const result = {
    ...(typeof getToken(tokens, 'EUR') !== 'undefined'
      ? { [getToken(tokens, 'EUR').address]: convertPrice(queryResult.EUR) }
      : {}),
    ...(typeof getToken(tokens, 'WETH') !== 'undefined'
      ? { [getToken(tokens, 'WETH').address]: convertPrice(queryResult.ETH) }
      : {}),
    ...(typeof getToken(tokens, 'MLN') !== 'undefined'
      ? { [getToken(tokens, 'MLN').address]: convertPrice(queryResult.MLN) }
      : {}),
    ...(typeof getToken(tokens, 'DGX') !== 'undefined'
      ? { [getToken(tokens, 'DGX').address]: convertPrice(queryResult.DGX) }
      : {}),
  };
  return result;
}

// TODO: make this more dynamic (different tokens) and flexible
// This function uses a default set of assets to get prices
/**
 * Get prices converted to the format our contracts expect
 * @param {Object} deployed - Contracts as returned by our deploy script
 * @param {string} fromSymbol - Quote asset symbol, used to price other assets
 */
// TODO: Change to BigInteger
async function getConvertedPricesDefault(deployed, fromSymbol) {
  const toSymbols = ['MLN', 'EUR', 'ETH', 'DGX'];
  const options = {
    json: true,
    uri: `${apiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(',')}&sign=true`,
  };
  const queryResult = await requestWithRetries(options, 3);

  if (queryResult[fromSymbol] !== 1) {
    throw new Error(`API call returned incorrect price for ${fromSymbol}`);
  } else if (Object.values(queryResult).indexOf(0) !== -1) {
    throw new Error('API call returned a zero price');
  }

  return {
    [deployed.eur.options.address]: convertPrice(queryResult.EUR),
    [deployed.weth.options.address]: convertPrice(queryResult.ETH),
    [deployed.mln.options.address]: convertPrice(queryResult.MLN),
    [deployed.dgx.options.address]: convertPrice(queryResult.DGX),
  };
}

/**
 * @param {Object} deployed - Object of deployed contracts from deployment script
 * @param {Object} inputPrices - Optional object of asset addresses (keys) and prices (values)
 */
export async function updateTestingPriceFeed(
  deployed,
  env,
  inputPrices = {},
  quoteSymbol = 'ETH',
) {
  let prices;
  const accounts = await env.eth.getAccounts();
  if (Object.keys(inputPrices).length === 0) {
    prices = await getConvertedPricesDefault(deployed, quoteSymbol);
  } else {
    prices = inputPrices;
  }
  await deployed.priceSource.methods
    .update(Object.keys(prices), Object.values(prices).map(e => e.toString()))
    .send({ from: accounts[0], gas: 8000000 });
}
