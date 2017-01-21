const async = require('async');
const assert = require('assert');
const functions = require('../utils/functions.js');
const constants = require('../utils/constants.js');


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

  // Prices Relative to Asset
  const eth_ett = 1.0; // By definition
  const eth_xbt = data.result.XETHXXBT.c[0]; // Price already relavtive to asset
  const eth_rep = functions.invertAssetPairPrice(data.result.XREPXETH.c[0]);
  const eth_eur = data.result.XETHZEUR.c[0]; // Price already relavtive to asset

  // Atomize Prices realtive to Asset
  const pricesRelAsset = [
    functions.atomizeAssetPrice(eth_ett, constants.ETHERTOKEN_PRECISION),
    functions.atomizeAssetPrice(eth_xbt, constants.BITCOINTOKEN_PRECISION),
    functions.atomizeAssetPrice(eth_rep, constants.REPTOKEN_PRECISION),
    functions.atomizeAssetPrice(eth_eur, constants.EUROTOKEN_PRECISION),
  ];

  console.log(pricesRelAsset)

  // Test globals
  let exchangeContract;
  let etherTokenContract;
  let bitcoinTokenContract;
  let exchangeTestCases;

  before('Check accounts', (done) => {
    assert.equal(accounts.length, 10);
    done();
  });

  it('Deploy smart contract', (done) => {
    exchangeContract = Exchange.deployed();
    etherTokenContract = EtherToken.deployed();
    bitcoinTokenContract = BitcoinToken.deployed();
    exchangeContract.lastOfferId()
    .then((result) => {
      assert.equal(result.toNumber(), INITIAL_OFFER_ID);
      return bitcoinTokenContract.totalSupply({ from: OWNER });
    })
    .then((result) => {
      assert.equal(result.toNumber(), constants.PREMINED_AMOUNT.toNumber());
      return bitcoinTokenContract.balanceOf(OWNER);
    })
    .then((result) => {
      assert.equal(result.toNumber(), constants.PREMINED_AMOUNT.toNumber());
      done();
    });
  });

  it('Create one side of the orderbook', (done) => {
    // Reduce sell amount by 0.1 on each order
    exchangeTestCases = [];
    for (let i = 0; i < NUM_OFFERS; i += 1) {
      // console.log((Math.random() - 0.5) * 0.1)
      exchangeTestCases.push({
        sell_how_much: pricesRelAsset[1] * (1 - (i * 0.1)),
        sell_which_token: bitcoinTokenContract.address,
        buy_how_much: 1 * constants.ether,
        buy_which_token: etherTokenContract.address,
        id: i + 1,
        owner: OWNER,
        active: true,
      });
    }

    console.log(exchangeTestCases)

    async.mapSeries(
      exchangeTestCases,
      (testCase, callbackMap) => {
        bitcoinTokenContract.approve(
          exchangeContract.address,
          testCase.sell_how_much,
          { from: OWNER }
        )
        .then(() => bitcoinTokenContract.allowance(OWNER, exchangeContract.address))
        .then((result) => {
          assert.equal(result, testCase.sell_how_much);
          return exchangeContract.offer(
            testCase.sell_how_much,
            testCase.sell_which_token,
            testCase.buy_how_much,
            testCase.buy_which_token,
            { from: OWNER }
          );
        })
        .then((txHash) => {
          Object.assign({ txHash }, testCase);
          return exchangeContract.lastOfferId({ from: OWNER });
        })
        .then((lastOfferId) => {
          assert.equal(testCase.id, lastOfferId);
          callbackMap(null, testCase);
        });
      },
      (err, results) => {
        exchangeTestCases = results;
        done();
      }
    );
  });

  it('Check if orders created', (done) => {
    exchangeContract.lastOfferId({ from: OWNER })
    .then((result) => {
      const lastOfferId = result.toNumber();
      assert.equal(lastOfferId, NUM_OFFERS);
      done();
    });
  });

  it('Check orders information', (done) => {
    async.mapSeries(
      exchangeTestCases,
      (testCase, callbackMap) => {
        exchangeContract.offers(testCase.id)
        .then((result) => {
          const [sellHowMuch, sellWhichTokenAddress, buyHowMuch, buyWhichTokenAddress, owner, active] = result;
          // TODO for more general token
          console.log(`Is active: ${active}`);
          console.log(`Sell how much: ${sellHowMuch / (10 ** constants.BITCOINTOKEN_PRECISION)}`);
          console.log(`Buy how much: ${buyHowMuch / (10 ** constants.ETHERTOKEN_PRECISION)}`);
          callbackMap(null, testCase);
        });
      },
      (err, results) => {
        exchangeTestCases = results;
        done();
      }
    );
  });

  it('Cancel one side of the orderbook', (done) => {
    async.mapSeries(
      exchangeTestCases,
      (testCase, callbackMap) => {
        exchangeContract.cancel(testCase.id, { from: OWNER })
        .then((txHash) => {
          const result = Object.assign({ txHash }, testCase);
          callbackMap(null, result);
        });
      },
      (err, results) => {
        exchangeTestCases = results;
        done();
      }
    );
  });

  it('Check orders information', (done) => {
    async.mapSeries(
      exchangeTestCases,
      (testCase, callbackMap) => {
        exchangeContract.offers(testCase.id)
        .then((result) => {
          const [sellHowMuch, sellWhichTokenAddress, buyHowMuch, buyWhichTokenAddress, owner, active] = result;
          // TODO for more general token
          console.log(`Is active: ${active}`);
          console.log(`Sell how much: ${sellHowMuch / (10 ** constants.BITCOINTOKEN_PRECISION)}`);
          console.log(`Buy how much: ${buyHowMuch / (10 ** constants.ETHERTOKEN_PRECISION)}`);
          callbackMap(null, testCase);
        });
      },
      (err, results) => {
        exchangeTestCases = results;
        done();
      }
    );
  });
});
