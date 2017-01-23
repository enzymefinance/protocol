// Price Feed

// Pre: Asset Pair; Eg. ETH/BTC
// Post: Inverted Asset Pair; Eg. BTC/ETH
exports.invertAssetPairPrice = price => 1.0 / price;

// Pre: Precision meaning the number of decimals it takes to represent the atomized price
// Post: Price in its smallest unit
/** Ex:
 *  Let asset == EUR-T, let Value of 1 ETH = 8.45 EUR-T =: 8.45 EUR
 *  and let EUR-T precision == 8,
 *  => ATOMIZEDPRICES[EUR-T] = 8.45 * 10 ** 8
 */
exports.atomizeAssetPrice = (price, precision) => Math.floor(price * (Math.pow(10, precision)));


// Exchange
