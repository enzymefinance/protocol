const constants = require('./constants.js');
const specs = require('./specs.js');
const async = require('async');

// Offers

// Pre:
// Post:
exports.syncOffer = (id, callback) => {
  Exchange.deployed().offers(id)
  .then((res) => {
    const [sellHowMuch, sellWhichTokenAddress, buyHowMuch, buyWhichTokenAddress, owner, active] = res;
    if (active) {
      const sellDecimals = specs.getTokenDecimalsByAddress(sellWhichTokenAddress);
      const buyDecimals = specs.getTokenDecimalsByAddress(buyWhichTokenAddress);
      const sellSymbol = specs.getTokenSymbolByAddress(sellWhichTokenAddress);
      const buySymbol = specs.getTokenSymbolByAddress(buyWhichTokenAddress);
      const buyHowMuchValue = buyHowMuch / (10 ** buyDecimals);
      const sellHowMuchValue = sellHowMuch / (10 ** sellDecimals);
      const offer = {
        id,
        owner,
        buyWhichTokenAddress,
        buyWhichToken: buySymbol,
        sellWhichTokenAddress,
        sellWhichToken: sellSymbol,
        buyHowMuch: buyHowMuchValue.toString(10),
        sellHowMuch: sellHowMuchValue.toString(10),
        ask_price: buyHowMuchValue / sellHowMuchValue,
        bid_price: sellHowMuchValue / buyHowMuchValue,
      };
      callback(null, offer);
    } else {
      callback('Not active', undefined);
    }
  });
};

// Pre:
// Post:
exports.sync = (callback) => {
  Exchange.deployed().lastOfferId()
  .then((result) => {
    const numOffers = result.toNumber();
    async.times(numOffers, (id, callbackMap) => {
      this.syncOffer(id + 1, (err, offer) => {
        if (!err) {
          callbackMap(null, offer);
        } else if (err == 'Not active') {
          callbackMap(null, undefined);
        } else {
          callbackMap(err, undefined);
        }
      });
    }, (err, offers) => {
      callback(null, offers);
    });
  });
};
