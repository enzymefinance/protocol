import rp from 'request-promise';

import { BN } from 'web3-utils';
import { BNExpInverse } from './BNmath';

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
 * @param {string} fromSymbol - Quote asset symbol, used to price other assets
 */
export async function getUpdatedTestPrices(fromSymbol = 'ETH') {

  const toSymbols = ['MLN', 'EUR', 'ETH', 'DAI'];
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
    eur: BNExpInverse(new BN(queryResult.EUR)).toString(),
    weth: BNExpInverse(new BN(queryResult.ETH)).toString(),
    mln: BNExpInverse(new BN(queryResult.MLN)).toString(),
    dai: BNExpInverse(new BN(queryResult.DAI)).toString()
  };
}
