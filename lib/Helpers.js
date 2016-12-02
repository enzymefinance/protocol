var BigNumber = require('bignumber.js');

// Contract constants
const PREMINED_PRECISION = 8;
const PREMINED_AMOUNT = new BigNumber(Math.pow(10, 10));
const BITCOINTOKEN_ATOMIZE = new BigNumber(Math.pow(10, PREMINED_PRECISION));
const DOLLARTOKEN_ATOMIZE = new BigNumber(Math.pow(10, PREMINED_PRECISION));
const EUROTOKEN_ATOMIZE = new BigNumber(Math.pow(10, PREMINED_PRECISION));

// External data set
var data = {"BTC":0.01117,"USD":8.45,"EUR":7.92};
const atomizedPrices = [
  data['BTC'] * BITCOINTOKEN_ATOMIZE,
  data['USD'] * DOLLARTOKEN_ATOMIZE,
  data['EUR'] * EUROTOKEN_ATOMIZE
];
// Set price of fungible relative to Ether
/** Ex:
 *  Let asset == UST, let Value of 1 UST := 1 USD == 0.118343195 ETH
 *  and let precision == 8,
 *  => assetPrices[UST] = 11834319
 */
const inverseAtomizedPrices = [
  1.0 / data['BTC'] * BITCOINTOKEN_ATOMIZE,
  1.0 / data['USD'] * DOLLARTOKEN_ATOMIZE,
  1.0 / data['EUR'] * EUROTOKEN_ATOMIZE
];

export { atomizedPrices, inverseAtomizedPrices };
