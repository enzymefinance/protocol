var BigNumber = require('bignumber.js');
var SolConstants = require('./SolConstants.js');


// External data set
var data = {"BTC":0.01117,"USD":8.45,"EUR":7.92};

const atomizedPrices = [
  data['BTC'] * SolConstants.BITCOINTOKEN_ATOMIZE,
  data['USD'] * SolConstants.DOLLARTOKEN_ATOMIZE,
  data['EUR'] * SolConstants.EUROTOKEN_ATOMIZE
];
// Set price of fungible relative to Ether
/** Ex:
 *  Let asset == UST, let Value of 1 UST := 1 USD == 0.118343195 ETH
 *  and let precision == 8,
 *  => assetPrices[UST] = 11834319
 */
const inverseAtomizedPrices = [
  1.0 / data['BTC'] * SolConstants.BITCOINTOKEN_ATOMIZE,
  1.0 / data['USD'] * SolConstants.DOLLARTOKEN_ATOMIZE,
  1.0 / data['EUR'] * SolConstants.EUROTOKEN_ATOMIZE
];

export { atomizedPrices, inverseAtomizedPrices };
