const constants = require('./constants.js');
const specs = require('../utils/specs.js');
const async = require('async');
const Exchange = artifacts.require('Exchange.sol');
const EtherToken = artifacts.require("./EtherToken.sol");
const BitcoinToken = artifacts.require("./BitcoinToken.sol");
const RepToken = artifacts.require("./RepToken.sol");
const EuroToken = artifacts.require("./EuroToken.sol");
const AssetProtocol = artifacts.require("./AssetProtocol.sol");

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

/// Pre: Kraken data as in: https://api.kraken.com/0/public/Ticker?pair=ETHXBT,REPETH,ETHEUR
/// Post: Prices in its smallest unit relative to Asset
function krakenPricesRelAsset(data) {
  // Prices Relative to Asset
  const ETHETT = 1.0; // By definition
  const ETHXBT = this.invertAssetPairPrice(data.result.XETHXXBT.c[0]);
  const ETHREP = data.result.XREPXETH.c[0]; // Price already relavtive to ether
  const ETHEUR = this.invertAssetPairPrice(data.result.XETHZEUR.c[0]);
  // Atomize Prices realtive to Asset
  return [
    this.atomizeAssetPrice(ETHETT, constants.ETHERTOKEN_DECIMALS),
    this.atomizeAssetPrice(ETHXBT, constants.BITCOINTOKEN_DECIMALS),
    this.atomizeAssetPrice(ETHREP, constants.REPTOKEN_DECIMALS),
    this.atomizeAssetPrice(ETHEUR, constants.EUROTOKEN_DECIMALS),
  ];
}

/// Pre: Kraken data as in: https://api.kraken.com/0/public/Ticker?pair=ETHXBT,REPETH,ETHEUR
/// Post: Prices in its smallest unit relative to Ether
function krakenPricesRelEther(data) {
  // Prices Relative to Ether
  const ETTETH = 1.0; // By definition
  const XBTETH = data.result.XETHXXBT.c[0]; // Price already relavtive to ether
  const REPETH = this.invertAssetPairPrice(data.result.XREPXETH.c[0]);
  const EURETH = data.result.XETHZEUR.c[0]; // Price already relavtive to ether
  // Atomize Prices realtive to Ether
  return [
    this.atomizeAssetPrice(ETTETH, constants.ETHERTOKEN_DECIMALS),
    this.atomizeAssetPrice(XBTETH, constants.BITCOINTOKEN_DECIMALS),
    this.atomizeAssetPrice(REPETH, constants.REPTOKEN_DECIMALS),
    this.atomizeAssetPrice(EURETH, constants.EUROTOKEN_DECIMALS),
  ];
}

// Exchange

/// Pre: Initialised offer object
/// Post: Executed offer as specified in offer object
function approveAndOffer(offer, callback) {
  const exchangeAddress = constants.EXCHANGE_ADDRESS;
  // Approve spending of selling amount at selling token
  AssetProtocol.at(offer.sell_which_token).approve(exchangeAddress, offer.sell_how_much)
  // Offer selling amount of selling token for buying amount of buying token
  .then(() => Exchange.at(exchangeAddress).offer(
      offer.sell_how_much,
      offer.sell_which_token,
      offer.buy_how_much,
      offer.buy_which_token,
      { from: offer.owner }))
  .then((txHash) => {
    // callback(null, txHash);
    return Exchange.at(exchangeAddress).getLastOfferId();
  })
  .then((result) => {
    console.log(result.toNumber())
    callback(null, txHash);
    return Exchange.at(exchangeAddress).getLastOfferId();
  });
}

/// Pre:
/// Post:
function buyOffer(id, owner, callback) {}

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
  Exchange.deployed().then(deployed => deployed.getLastOfferId())
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
/// Post: Multiple offers created
function buyOneEtherFor(sellHowMuch, sellWhichToken, owner, depth, callback) {
  let offers = [];
  const etherTokenAddress = specs.tokens[specs.network]['ETH-T'];
  // Reduce sell amount by 0.1 on each order
  for (let i = 0; i < depth; i += 1) {
    // console.log((Math.random() - 0.5) * 0.1)
    offers.push({
      sell_how_much: Math.floor(sellHowMuch * (1 - (i * 0.1))),
      sell_which_token: sellWhichToken,
      buy_how_much: 1 * constants.ether,
      buy_which_token: etherTokenAddress,
      id: i + 1,
      owner,
      active: true,
    });
  }

  // Execute all above created offers
  async.mapSeries(
    offers,
    (offer, callbackMap) => {
      this.approveAndOffer(offer,
        (err, hash) => {
          if (!err) {
            console.log(hash);
            callbackMap(null, Object.assign({ txHash: hash }, offer));
          } else {
            callbackMap(err, undefined);
          }
        });
    }, (err, results) => {
      offers = results;
      callback(null, offers);
    });
}

module.exports = {
  invertAssetPairPrice,
  atomizeAssetPrice,
  krakenPricesRelAsset,
  krakenPricesRelEther,
  approveAndOffer,
  buyOffer,
  cancelOffer,
  cancelAllOffersOfOwner,
  buyOneEtherFor,
};
