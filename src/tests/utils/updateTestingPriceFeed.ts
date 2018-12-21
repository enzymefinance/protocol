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

// TODO: make this more dynamic (different tokens) and flexible
/**
 * Get prices converted to the format our contracts expect
 * @param {Object} deployed - Contracts as returned by our deploy script
 * @param {string} fromSymbol - Quote asset symbol, used to price other assets
 */
// TODO: Change to BigInteger
async function getConvertedPrices(deployed, fromSymbol) {
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

  const quoteDecimals = 18; // Hardcoded for now

  const convertedEth = new BigNumber((1 / queryResult.ETH).toFixed(16)).mul(
    10 ** quoteDecimals,
  );
  const convertedEur = new BigNumber((1 / queryResult.EUR).toFixed(16)).mul(
    10 ** quoteDecimals,
  );
  const convertedMln = new BigNumber((1 / queryResult.MLN).toFixed(16)).mul(
    10 ** quoteDecimals,
  );
  const convertedDgx = new BigNumber((1 / queryResult.DGX).toFixed(16)).mul(
    10 ** quoteDecimals,
  );

  return {
    [deployed.eur.options.address]: convertedEur,
    [deployed.weth.options.address]: convertedEth,
    [deployed.mln.options.address]: convertedMln,
    [deployed.dgx.options.address]: convertedDgx,
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
    prices = await getConvertedPrices(deployed, quoteSymbol);
  } else {
    prices = inputPrices;
  }
  await deployed.priceSource.methods
    .update(Object.keys(prices), Object.values(prices).map(e => e.toString()))
    .send({ from: accounts[0], gas: 8000000 });
}
