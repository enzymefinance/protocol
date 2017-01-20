const async = require('async');
const assert = require('assert');
const functions = require('../utils/functions.js');
const constants = require('../utils/constants.js');
const constants = require('../utils/constants.js');


contract('Exchange', (accounts) => {
  // Test constants
  const INITIAL_OFFER_ID = 0;
  const OWNER = accounts[0];
  const NUM_OFFERS = 3;
  const DATA = { BTC: 0.01117, USD: 8.45, EUR: 7.92 };

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
    Exchange.new()
    .then((result) => {
      exchangeContract = result;
      return exchangeContract.lastOfferId();
    })
    .then((result) => {
      assert.equal(result.toNumber(), INITIAL_OFFER_ID);
      return EtherToken.new();
    })
    .then((result) => {
      etherTokenContract = result;
      return BitcoinToken.new({ from: OWNER });
    })
    .then((result) => {
      bitcoinTokenContract = result;
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
      exchangeTestCases.push(
        {
          sell_how_much: functions.createAtomizedPrices(DATA)[0] * (1 - (i * 0.1)),
          sell_which_token: bitcoinTokenContract.address,
          buy_how_much: 1 * constants.ether,
          buy_which_token: etherTokenContract.address,
          id: i + 1,
          owner: OWNER,
          active: true,
        }
      );
    }

    console.log(exchangeTestCases)

    async.mapSeries(
      exchangeTestCases,
      (testCase, callbackMap) => {
        bitcoinTokenContract.approve(
          exchangeContract.address,
          testCase.sell_how_much,
          { from: OWNER })
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
          .then(() => {
            // const sellHowMuch = result[0];
            // const buyHowMuch = result[2];
            // console.log(testCase.id, sellHowMuch.toNumber(), buyHowMuch.toNumber());
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
          .then(() => {
            // const sellHowMuch = result[0];
            // const buyHowMuch = result[2];
            // console.log(testCase.id, sellHowMuch.toNumber(), buyHowMuch.toNumber());
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
