const async = require('async');
const assert = require('assert');
const constants = require('../utils/constants.js');
const functions = require('../utils/functions.js');
const collections = require('../utils/collections.js');


let offers = [];  // Offers collections

contract('Exchange', (accounts) => {
  // Test constants
  const INITIAL_OFFER_ID = 0;
  const OWNER = accounts[0];
  const NUM_OFFERS = 2;
  // Kraken example for: https://api.kraken.com/0/public/Ticker?pair=ETHXBT,REPETH,ETHEUR
  const data = {
    'error':[],
    'result': {
      'XETHXXBT': {'a':['0.011558','135','135.000'],'b':['0.011550','376','376.000'],'c':['0.011550','0.47405000'],'v':['100153.86921002','112421.66650936'],'p':['0.011477','0.010527'],'t':[1980,2248],'l':['0.011318','0.011318'],'h':['0.011651','0.011710'],'o':'0.011521'},
      'XETHZEUR': {'a':['9.83249','23','23.000'],'b':['9.79000','72','72.000'],'c':['9.80510','16.54860000'],'v':['33417.76252715','39085.89051588'],'p':['9.72591','9.70190'],'t':[1384,1601],'l':['9.53300','9.51171'],'h':['9.84900','9.84900'],'o':'9.68796'},
      'XREPXETH': {'a':['0.435820','1','1.000'],'b':['0.430570','80','80.000'],'c':['0.435790','1.71736386'],'v':['483.41580154','569.06380459'],'p':['0.428581','0.429142'],'t':[36,48],'l':['0.421730','0.421730'],'h':['0.437000','0.437000'],'o':'0.423270'},
    }
  };
  // Atomize Prices realtive to Asset
  const pricesRelEther = functions.krakenPricesRelEther(data);
  console.log(`pricesRelEther: ${pricesRelEther}`);


  before('Check accounts, exchange and premined amount', (done) => {
    assert.equal(accounts.length, 10);
    Exchange.deployed().lastOfferId()
    .then((result) => {
      assert.equal(result.toNumber(), INITIAL_OFFER_ID);
      return BitcoinToken.deployed().totalSupply({ from: OWNER });
    })
    .then((result) => {
      assert.equal(result.toNumber(), constants.PREMINED_AMOUNT.toNumber());
      return BitcoinToken.deployed().balanceOf(OWNER);
    })
    .then((result) => {
      assert.equal(result.toNumber(), constants.PREMINED_AMOUNT.toNumber());
      done();
    });
  });

  it('Create one side of the orderbook', (done) => {
    functions.buyOneEtherFor(
      pricesRelEther[1],
      BitcoinToken.deployed().address,
      OWNER,
      NUM_OFFERS,
      (err, result) => {
        if (!err) {
          done();
        } else {
          console.log(err);
        }
      }
    );
  });

  it('Check if orders created', (done) => {
    Exchange.deployed().lastOfferId({ from: OWNER })
    .then((result) => {
      const lastOfferId = result.toNumber();
      assert.equal(lastOfferId, NUM_OFFERS);
      done();
    });
  });

  it('Check orders information', (done) => {
    collections.sync(
      (err, result) => {
        if (!err) {
          offers = result;
          done();
        } else {
          console.log(err);
        }
      }
    );
  });

  it('Cancel one side of the orderbook', (done) => {
    console.log(offers);
    done();
    async.mapSeries(
      offers,
      (offer, callbackMap) => {
        Exchange.deployed().cancel(offer.id, { from: OWNER })
        .then((txHash) => {
          const result = Object.assign({ txHash }, offer);
          callbackMap(null, result);
        });
      },
      (err, results) => {
        offers = results;
        done();
      }
    );
  });
  //
  // it('Check orders information', (done) => {
  //   async.mapSeries(
  //     offers,
  //     (offer, callbackMap) => {
  //       Exchange.deployed().offers(offer.id)
  //       .then((result) => {
  //         const [sellHowMuch, sellWhichTokenAddress, buyHowMuch, buyWhichTokenAddress, owner, active] = result;
  //         // TODO for more general token
  //         console.log(`Is active: ${active}`);
  //         console.log(`Sell how much: ${sellHowMuch / (10 ** constants.BITCOINTOKEN_PRECISION)}`);
  //         console.log(`Buy how much: ${buyHowMuch / (10 ** constants.ETHERTOKEN_PRECISION)}`);
  //         callbackMap(null, offer);
  //       });
  //     },
  //     (err, results) => {
  //       offers = results;
  //       done();
  //     }
  //   );
  // });
});
