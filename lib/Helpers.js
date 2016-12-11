var BigNumber = require('bignumber.js');
var SolConstants = require('./SolConstants.js');


exports.createAtomizedPrices = function(data) {
  return [
    data['BTC'] * SolConstants.BITCOINTOKEN_ATOMIZE,
    data['USD'] * SolConstants.DOLLARTOKEN_ATOMIZE,
    data['EUR'] * SolConstants.EUROTOKEN_ATOMIZE
  ];
};

// Set price of fungible relative to Ether
/** Ex:
 *  Let asset == UST, let Value of 1 UST := 1 USD == 0.118343195 ETH
 *  and let precision == 8,
 *  => assetPrices[UST] = 11834319
 */
exports.createInverseAtomizedPrices = function(data) {
  return [
    1.0 / data['BTC'] * SolConstants.BITCOINTOKEN_OUTSTANDING_PRECISION,
    1.0 / data['USD'] * SolConstants.DOLLARTOKEN_OUTSTANDING_PRECISION,
    1.0 / data['EUR'] * SolConstants.EUROTOKEN_OUTSTANDING_PRECISION
  ];
};
