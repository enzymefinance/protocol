import { BN } from 'web3-utils';
import { BNExpInverse } from './BNmath';

import rp from 'request-promise';

// const rp = require('request-promise');

const priceApiPath = 'https://min-api.cryptocompare.com/data/price';

// retry the request if it fails (helps with bad connections)
async function requestWithRetries(options, maxRetries) {
  if (maxRetries === -1) {
    throw new Error('Request failed. Max retry limit reached.');
  } else {
    try {
      return await rp(options);
    } catch (err) {
      console.error(
        `Error during request:\n${err.message}\n\n${JSON.stringify(
          options,
          null,
          2,
        )}`,
      );
      return requestWithRetries(options, maxRetries - 1);
    }
  }
}

/**
 * Get prices converted to the format our contracts expect
 * @param {Object} deployed - Contracts as returned by our deploy script
 * @param {string} fromSymbol - Quote asset symbol, used to price other assets
 */
export async function getUpdatedTestPrices(deployed, fromSymbol) {
  const toSymbols = ['MLN', 'EUR', 'ETH', 'DGX', 'DAI'];
  const options = {
    json: true,
    uri: `${priceApiPath}?fsym=${fromSymbol}&tsyms=${toSymbols.join(',')}&sign=true`,
  };
  const queryResult = await requestWithRetries(options, 3);

  if (queryResult[fromSymbol] !== 1) {
    throw new Error(`API call returned incorrect price for ${fromSymbol}`);
  } else if (Object.values(queryResult).indexOf(0) !== -1) {
    throw new Error('API call returned a zero price');
  }

  return {
    [deployed.eur.options.address]: BNExpInverse(new BN(queryResult.EUR)).toString(),
    [deployed.weth.options.address]: BNExpInverse(new BN(queryResult.ETH)).toString(),
    [deployed.mln.options.address]: BNExpInverse(new BN(queryResult.MLN)).toString(),
    [deployed.dgx.options.address]: BNExpInverse(new BN(queryResult.DGX)).toString(),
    [deployed.dai.options.address]: BNExpInverse(new BN(queryResult.DAI)).toString()
  };
}
