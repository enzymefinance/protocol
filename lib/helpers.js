var BigNumber = require('bignumber.js');

// Contract constants
const PREMINED_PRECISION = new BigNumber(Math.pow(10,8));
const PREMINED_AMOUNT = new BigNumber(Math.pow(10,10));

// External data set
var data = {"BTC":0.01117,"USD":8.45,"EUR":7.92};
const atomizedPrices = [
  data['BTC'] * PREMINED_PRECISION,
  data['USD'] * PREMINED_PRECISION,
  data['EUR'] * PREMINED_PRECISION
];
// Set price of fungible relative to Ether
/** Ex:
 *  Let asset == UST, let Value of 1 UST := 1 USD == 0.080456789 ETH
 *  and let precision == 8,
 *  => assetPrices[UST] = 08045678
 */
const inverseAtomizedPrices = [
  1.0 / data['BTC'] * PREMINED_PRECISION,
  1.0 / data['USD'] * PREMINED_PRECISION,
  1.0 / data['EUR'] * PREMINED_PRECISION
];

export { atomizedPrices, inverseAtomizedPrices };
