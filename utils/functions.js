const constants = require('./constants.js');
const specs = require('../utils/specs.js');
const async = require('async');
const Exchange = artifacts.require('Exchange.sol');
const EtherToken = artifacts.require('./EtherToken.sol');
const BitcoinToken = artifacts.require('./BitcoinToken.sol');
const RepToken = artifacts.require('./RepToken.sol');
const EuroToken = artifacts.require('./EuroToken.sol');
const AssetProtocol = artifacts.require('./AssetProtocol.sol');

// Price Feed

/// Pre: Asset Pair; Eg. ETH/BTC
/// Post: Inverted Asset Pair; Eg. BTC/ETH
function invertAssetPairPrice(price) { return 1.0 / price; }

/// Pre: Decimals meaning the number of decimals it takes to EURresent the atomized price
/// Post: Price in its smallest unit
/** Ex:
 *  Let asset == EUR-T, let Value of 1 ETH = 8.45 EUR-T =: 8.45 EUR
 *  and let EUR-T decimals == 8,
 *  => ATOMIZEDPRICES[EUR-T] = 8.45 * 10 ** 8
 */
function atomizeAssetPrice(price, decimals) { return Math.floor(price * (Math.pow(10, decimals))); }

/// Pre: CryptoCompare prices as in: https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=BTC,USD,EUR
/// Post: Prices in its smallest unit relative to Asset
function atomizePriceData(data) {
  return Object.keys(data)
    .map((key) => this.atomizeAssetPrice(data[key], this.getDecimals(key)));
}

/// Pre: Kraken data as in: https://api.kraken.com/0/public/Ticker?pair=MLNETH,ETHXBT,REPETH,ETHEUR
/// Post: Prices in its smallest unit relative to Asset
function krakenPricesRelAsset(data) {
  // Prices Relative to Asset
  const ETHETT = 1.0; // By definition
  const ETHXBT = this.invertAssetPairPrice(data.result.XETHXXBT.c[0]);
  const ETHREP = data.result.XREPXETH.c[0]; // Price already relavtive to ether
  const ETHMLN = data.result.XMLNXETH.c[0]; // Price already relavtive to ether
  const ETHEUR = this.invertAssetPairPrice(data.result.XETHZEUR.c[0]);
  // Atomize Prices realtive to Asset
  return [
    this.atomizeAssetPrice(ETHETT, constants.ETHERTOKEN_DECIMALS),
    this.atomizeAssetPrice(ETHMLN, constants.MELONTOKEN_DECIMALS),
    this.atomizeAssetPrice(ETHXBT, constants.BITCOINTOKEN_DECIMALS),
    this.atomizeAssetPrice(ETHREP, constants.REPTOKEN_DECIMALS),
    this.atomizeAssetPrice(ETHEUR, constants.EUROTOKEN_DECIMALS),
  ];
}

/// Pre: Kraken data as in: https://api.kraken.com/0/public/Ticker?pair=MLNETH,ETHXBT,REPETH,ETHEUR
/// Post: Prices in its smallest unit relative to Ether
function krakenPricesRelEther(data) {
  // Prices Relative to Ether
  const ETTETH = 1.0; // By definition
  const XBTETH = data.result.XETHXXBT.c[0]; // Price already relavtive to ether
  const REPETH = this.invertAssetPairPrice(data.result.XREPXETH.c[0]);
  const ETHMLN = this.invertAssetPairPrice(data.result.XMLNXETH.c[0]);
  const EURETH = data.result.XETHZEUR.c[0]; // Price already relavtive to ether
  // Atomize Prices realtive to Ether
  return [
    this.atomizeAssetPrice(ETTETH, constants.ETHERTOKEN_DECIMALS),
    this.atomizeAssetPrice(ETHMLN, constants.MELONTOKEN_DECIMALS),
    this.atomizeAssetPrice(XBTETH, constants.BITCOINTOKEN_DECIMALS),
    this.atomizeAssetPrice(REPETH, constants.REPTOKEN_DECIMALS),
    this.atomizeAssetPrice(EURETH, constants.EUROTOKEN_DECIMALS),
  ];
}

// Exchange

/// Pre: Initialised offer object
/// Post: Executed offer as specified in offer object
function approveAndOffer(offer, callback) {
  Exchange.deployed().then((deployed) => {
    // Approve spending of selling amount at selling token
    AssetProtocol.at(offer.sell_which_token).approve(deployed.address, offer.sell_how_much)
    // Offer selling amount of selling token for buying amount of buying token
    .then(() => deployed.make(
        offer.sell_how_much,
        offer.sell_which_token,
        offer.buy_how_much,
        offer.buy_which_token,
        { from: offer.owner }))
    .then((txHash) => {
      callback(null, txHash);
      return deployed.getLastOrderId();
    })
  })
}

/// Pre:
/// Post:
function takeOrder(id, owner, callback) {}

/// Pre:
/// Post:
function cancelOffer(id, owner, callback) {
  Exchange.deployed().then(deployed => deployed.cancel(id, { from: owner }))
  .then((txHash) => {
    // TODO handel better
    // const result = Object.assign({ txHash }, offer);
    callback(null, txHash);
  });
}

/// Pre:
/// Post:
function cancelAllOffersOfOwner(owner, callback) {
  Exchange.deployed().then(deployed => deployed.getLastOrderId())
  .then((result) => {
    const numOffers = result.toNumber();

    async.times(numOffers, (id, callbackMap) => {
      // TODO better naming of offer - see cnacelOffer callback
      this.cancelOffer(id + 1, owner, (err, txHash) => {
        if (!err) {
          callbackMap(null, txHash);
        } else {
          callbackMap(err, undefined);
        }
      });
    }, (err, txHashs) => {
      callback(null, txHashs);
    });
  });
}

// Liquidity Provider

// Note: Simple liquidity provider
/// Pre: Only owner of premined amount of assets. Always buying one Ether
/// Post: Multiple orders created
function takeOneEtherFor(sellHowMuch, sellWhichToken, owner, depth, callback) {
  let orders = [];
  let etherTokenAddress;
  EtherToken.deployed().then((deployed) => {
    etherTokenAddress = deployed.address;
    // Reduce sell amount by 0.1 on each order
    for (let i = 0; i < depth; i += 1) {
      // console.log((Math.random() - 0.5) * 0.1)
      orders.push({
        sell_how_much: Math.floor(sellHowMuch * (1 - (i * 0.1))),
        sell_which_token: sellWhichToken,
        buy_how_much: 1 * constants.ether,
        buy_which_token: etherTokenAddress,
        id: i + 1,
        owner,
        active: true,
      });
    }
    // Execute all above created orders
    async.mapSeries(
      orders,
      (offer, callbackMap) => {
        this.approveAndOffer(offer,
          (err, hash) => {
            if (!err) {
              callbackMap(null, Object.assign({ txHash: hash }, offer));
            } else {
              callbackMap(err, undefined);
            }
          });
      }, (err, results) => {
        orders = results;
        callback(null, orders);
      });
  });
}

// get decimal places by symbol
const getDecimals = (sym) => {
  switch (sym.toUpperCase()) {
    case 'ANT':
      return constants.ARAGONTOKEN_DECIMALS;
    case 'AVT':
      return constants.AVENTUSTOKEN_DECIMALS;
    case 'BNT':
      return constants.BANCORTOKEN_DECIMALS;
    case 'BAT':
      return constants.BASICATTENTIONTOKEN_DECIMALS;
    case 'BTC':
      return constants.BITCOINTOKEN_DECIMALS;
    case 'DGD':
      return constants.DIGIXDAOTOKEN_DECIMALS;
    case 'DGX':
      return constants.DIGIXGOLDTOKEN_DECIMALS;
    case 'DOGE':
      return constants.DOGECOINTOKEN_DECIMALS;
    case 'ETC':
      return constants.ETHERCLASSICTOKEN_DECIMALS;
    case 'ETH':
      return constants.ETHERTOKEN_DECIMALS;
    case 'EUR':
      return constants.EUROTOKEN_DECIMALS;
    case 'GNO':
      return constants.GNOSISTOKEN_DECIMALS;
    case 'GNT':
      return constants.GOLEMTOKEN_DECIMALS;
    case 'ICN':
      return constants.ICONOMITOKEN_DECIMALS;
    case 'LTC':
      return constants.LITECOINTOKEN_DECIMALS;
    case 'MLN':
      return constants.MELONTOKEN_DECIMALS;
    case 'REP':
      return constants.REPTOKEN_DECIMALS;
    case 'XRP':
      return constants.RIPPLETOKEN_DECIMALS;
    case 'SNT':
      return constants.STATUSTOKEN_DECIMALS;
    default:
      throw new Error('Invalid symbol');
  }
};

module.exports = {
  invertAssetPairPrice,
  atomizeAssetPrice,
  krakenPricesRelAsset,
  krakenPricesRelEther,
  approveAndOffer,
  takeOrder,
  cancelOffer,
  cancelAllOffersOfOwner,
  takeOneEtherFor,
  getDecimals,
  atomizePriceData,
};
