const constants = require('./constants.js');
const async = require('async');

// Price Feed

// Pre: Asset Pair; Eg. ETH/BTC
// Post: Inverted Asset Pair; Eg. BTC/ETH
exports.invertAssetPairPrice = price => 1.0 / price;

// Pre: Precision meaning the number of decimals it takes to EURresent the atomized price
// Post: Price in its smallest unit
/** Ex:
 *  Let asset == EUR-T, let Value of 1 ETH = 8.45 EUR-T =: 8.45 EUR
 *  and let EUR-T precision == 8,
 *  => ATOMIZEDPRICES[EUR-T] = 8.45 * 10 ** 8
 */
exports.atomizeAssetPrice = (price, precision) => Math.floor(price * (Math.pow(10, precision)));

// Pre: Kraken data as in: https://api.kraken.com/0/public/Ticker?pair=ETHXBT,REPETH,ETHEUR
// Post: Prices in its smallest unit relative to Asset
exports.krakenPricesRelAsset = (data) => {
  // Prices Relative to Asset
  const ETHETT = 1.0; // By definition
  const ETHXBT = this.invertAssetPairPrice(data.result.XETHXXBT.c[0]);
  const ETHREP = this.invertAssetPairPrice(data.result.XREPXETH.c[0]);
  const ETHEUR = this.invertAssetPairPrice(data.result.XETHZEUR.c[0]);
  // Atomize Prices realtive to Asset
  return [
    this.atomizeAssetPrice(ETHETT, constants.ETHERTOKEN_PRECISION),
    this.atomizeAssetPrice(ETHXBT, constants.BITCOINTOKEN_PRECISION),
    this.atomizeAssetPrice(ETHREP, constants.REPTOKEN_PRECISION),
    this.atomizeAssetPrice(ETHEUR, constants.EUROTOKEN_PRECISION),
  ];
};

// Pre: Kraken data as in: https://api.kraken.com/0/public/Ticker?pair=ETHXBT,REPETH,ETHEUR
// Post: Prices in its smallest unit relative to Ether
exports.krakenPricesRelEther = (data) => {
  // Prices Relative to Ether
  const ETTETH = 1.0; // By definition
  const XBTETH = data.result.XETHXXBT.c[0]; // Price already relavtive to ether
  const REPETH = data.result.XREPXETH.c[0]; // Price already relavtive to ether
  const EURETH = data.result.XETHZEUR.c[0]; // Price already relavtive to ether
  // Atomize Prices realtive to Ether
  return [
    this.atomizeAssetPrice(ETTETH, constants.ETHERTOKEN_PRECISION),
    this.atomizeAssetPrice(XBTETH, constants.BITCOINTOKEN_PRECISION),
    this.atomizeAssetPrice(REPETH, constants.REPTOKEN_PRECISION),
    this.atomizeAssetPrice(EURETH, constants.EUROTOKEN_PRECISION),
  ];
};

// Exchange

// Pre: Initialised offer object
// Post: Executed offer as specified in offer object
exports.approveAndOffer = (offer, callback) => {
  // Approve spending of selling amount at selling token
  AssetProtocol.at(offer.sell_which_token).approve(
    Exchange.deployed().address,
    offer.sell_how_much)
  // Offer selling amount of selling token for buying amount of buying token
  .then(() =>
    Exchange.deployed().offer(
      offer.sell_how_much,
      offer.sell_which_token,
      offer.buy_how_much,
      offer.buy_which_token,
      { from: offer.owner }))
  .then((txHash) => {
    callback(null, txHash);
  });
};

// Pre:
// Post:
exports.buyOffer = (id, owner, callback) => {};

// Pre:
// Post:
exports.cancelOffer = (id, owner, callback) => {
  Exchange.deployed().cancel(id, { from: owner })
  .then((txHash) => {
    //TODO handel better
    // const result = Object.assign({ txHash }, offer);
    callback(null, txHash);
  });
};

// Pre:
// Post:
exports.cancelAllOffersOfOwner = (owner, callback) => {
  Exchange.deployed().lastOfferId()
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
};

// Liquidity Provider

// Note: Simple liquidity provider
// Pre: Only owner of premined amount of assets. Always buying one Ether
// Post: Multiple offers created
exports.buyOneEtherFor = (sellHowMuch, sellWhichToken, owner, depth, callback) => {
  let offers = [];
  // Reduce sell amount by 0.1 on each order
  for (let i = 0; i < depth; i += 1) {
    // console.log((Math.random() - 0.5) * 0.1)
    offers.push({
      sell_how_much: Math.floor(sellHowMuch * (1 - (i * 0.1))),
      sell_which_token: sellWhichToken,
      buy_how_much: 1 * constants.ether,
      buy_which_token: EtherToken.deployed().address,
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
            callbackMap(null, Object.assign({ txHash: hash }, offer));
          } else {
            callbackMap(err, undefined);
          }
        });
    }, (err, results) => {
      offers = results;
      callback(null, offers);
    });
};
