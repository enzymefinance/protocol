const constants = require('./constants.js');
const specs = require('./specs.js');
const async = require('async');

const Exchange = artifacts.require('Exchange.sol');

// Offers

/// Pre:
/// Post:
function syncOffer(id, callback) {
  Exchange.deployed().then(deployed => deployed.orders(id))
  .then((res) => {
    const [sellHowMuch, sellWhichTokenAddress, buyHowMuch, buyWhichTokenAddress, owner, active] = res;
    if (active) {
      const sellPrecision = specs.getTokenDecimalsByAddress(sellWhichTokenAddress);
      const buyPrecision = specs.getTokenDecimalsByAddress(buyWhichTokenAddress);
      const sellSymbol = specs.getTokenSymbolByAddress(sellWhichTokenAddress);
      const buySymbol = specs.getTokenSymbolByAddress(buyWhichTokenAddress);
      // console.log(`buySymbol ${buySymbol}, buyWhichTokenAddress ${buyWhichTokenAddress}`)
      const buyHowMuchValue = buyHowMuch / (Math.pow(10, buyPrecision));
      const sellHowMuchValue = sellHowMuch / (Math.pow(10, sellPrecision));
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
}

/// Pre:
/// Post:
function sync(callback) {
  Exchange.deployed().then(deployed => deployed.getLastOfferId())
  .then((result) => {
    const numOffers = result.toNumber();
    async.times(numOffers, (id, callbackMap) => {
      syncOffer(id + 1, (err, offer) => {
        if (!err) {
          callbackMap(null, offer);
        } else if (err === 'Not active') {
          callbackMap(null, undefined);
        } else {
          callbackMap(err, undefined);
        }
      });
    }, (err, orders) => {
      callback(null, orders);
    });
  });
}

module.exports = {
  sync,
};
