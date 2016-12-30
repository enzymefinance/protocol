const SolConstants = require('./SolConstants.js');

// Price of Ether relative to smallest unit of token
/** Ex:
 *  Let asset == UST, let Value of 1 ETH = 8.45 USD =: 8.45 UST
 *  and let UST precision == 8,
 *  => ATOMIZEDPRICES[UST] = 8.45 * 10 ** 8
 */
exports.createAtomizedPrices = data => [
  data.ETH * SolConstants.ETHERTOKEN_ATOMIZE,
  data.BTC * SolConstants.BITCOINTOKEN_ATOMIZE,
  data.USD * SolConstants.DOLLARTOKEN_ATOMIZE,
  data.EUR * SolConstants.EUROTOKEN_ATOMIZE,
];


// Price of smallest unit of token relative to smallest unit of Ether, eg Wei
/** Ex:
 *  Let asset == UST, let Value of 1 UST := 1 USD == 0.118343195 ETH
 *  and let UST precision == 8,
 *  hence UST outstanding precision == 18 - 8 == 10
 *  => INVERSEATOMIZEDPRICES[UST] = 1183431950
 */
exports.createInverseAtomizedPrices = data => [
  (1.0 * SolConstants.ETHER_ATOMIZE) / (data.ETH * SolConstants.ETHERTOKEN_ATOMIZE),
  (1.0 * SolConstants.ETHER_ATOMIZE) / (data.BTC * SolConstants.BITCOINTOKEN_ATOMIZE),
  (1.0 * SolConstants.ETHER_ATOMIZE) / (data.USD * SolConstants.DOLLARTOKEN_ATOMIZE),
  (1.0 * SolConstants.ETHER_ATOMIZE) / (data.EUR * SolConstants.EUROTOKEN_ATOMIZE),
];
