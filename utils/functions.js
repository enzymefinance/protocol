const BigNumber = require('bignumber.js');

const constants = require('./constants.js');

// Price of Ether relative to smallest unit of token
/** Ex:
 *  Let asset == EUT, let Value of 1 ETH = 8.45 EUT =: 8.45 EUR
 *  and let EUT precision == 8,
 *  => ATOMIZEDPRICES[EUT] = 8.45 * 10 ** 8
 */
exports.createAtomizedPrices = data => [
  Math.floor(data.ETH * constants.ETHERTOKEN_ATOMIZE),
  Math.floor(data.BTC * constants.BITCOINTOKEN_ATOMIZE),
  Math.floor(data.REP * constants.DOLLARTOKEN_ATOMIZE),
  Math.floor(data.EUR * constants.EUROTOKEN_ATOMIZE),
];


// Price of smallest unit of token relative to smallest unit of Ether, eg Wei
/** Ex:
 *  Let asset == EUR, let Value of 1 EUR := 1 USD == 0.118343195 ETH
 *  and let EUT precision == 8,
 *  hence EUT outstanding precision == 18 - 8 == 10
 *  => INVERSEATOMIZEDPRICES[EUT] = 1183431950
 */
exports.createInverseAtomizedPrices = data => [
  Math.floor((1.0 * constants.ETHER_ATOMIZE) / (data.ETH * constants.ETHERTOKEN_ATOMIZE)),
  Math.floor((1.0 * constants.ETHER_ATOMIZE) / (data.BTC * constants.BITCOINTOKEN_ATOMIZE)),
  Math.floor((1.0 * constants.ETHER_ATOMIZE) / (data.USD * constants.DOLLARTOKEN_ATOMIZE)),
  Math.floor((1.0 * constants.ETHER_ATOMIZE) / (data.EUR * constants.EUROTOKEN_ATOMIZE)),
];


// Calculate Price as stored in Solidity
exports.calcSolPrice = (newPrice, precision) => {
  /* Note:
   *  This calculaion is not exact.
   *  Error sources are:
   *    Math.floor and
   *    Finite amount of decimals (precision)
   */
  const power = 18 - precision;
  const divisor = `1e+${power}`;
  return Math.floor(newPrice.dividedBy(new BigNumber(divisor)).toNumber());
};
