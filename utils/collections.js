const constants = require('./constants.js');
const async = require('async');

// Offers

// Pre:
// Post:
exports.syncOffer = (id, callback) => {
  Exchange.deployed().offers(id)
  .then((res) => {
    const [sellHowMuch, sellWhichTokenAddress, buyHowMuch, buyWhichTokenAddress, owner, active] = res;
    if (active) {
      // TODO make more efficient
      let sellPrecision;
      let sellToken;
      let buyPrecision;
      let buyToken;
      AssetProtocol.at(sellWhichTokenAddress).getPrecision()
      .then((result) => {
        sellPrecision = result.toNumber();
        return AssetProtocol.at(sellWhichTokenAddress).getSymbol();
      })
      .then((result) => {
        sellToken = result;
        return AssetProtocol.at(buyWhichTokenAddress).getPrecision();
      })
      .then((result) => {
        buyPrecision = result.toNumber();
        return AssetProtocol.at(buyWhichTokenAddress).getSymbol();
      })
      .then((result) => {
        buyToken = result;

        const buyHowMuchValue = buyHowMuch / (10 ** buyPrecision);
        const sellHowMuchValue = sellHowMuch / (10 ** sellPrecision);
        const offer = {
          id,
          owner,
          buyWhichTokenAddress,
          buyWhichToken: buyToken,
          sellWhichTokenAddress,
          sellWhichToken: sellToken,
          buyHowMuch: buyHowMuchValue.toString(10),
          sellHowMuch: sellHowMuchValue.toString(10),
          ask_price: buyHowMuchValue / sellHowMuchValue,
          bid_price: sellHowMuchValue / buyHowMuchValue,
        };
        callback(null, offer);
      });
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
        } else {
          callbackMap(err, undefined);
        }
      });
    }, (err, offers) => {
      callback(null, offers);
    });
  });
};
