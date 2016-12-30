const async = require('async');
const assert = require('assert');
const Helpers = require('../lib/Helpers.js');
const SolConstants = require('../lib/SolConstants.js');


contract('PriceFeed', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const DATA = { BTC: 0.01117, USD: 8.45, EUR: 7.92 };
  let priceFeedTestCases = [
    {
      address: '0x0000000000000000000000000000000000000000',
      price: Helpers.createInverseAtomizedPrices(DATA)[0],
    },
    {
      address: '0x0000000000000000000000000000000000000001',
      price: Helpers.createInverseAtomizedPrices(DATA)[1],
    },
    {
      address: '0x0000000000000000000000000000000000000002',
      price: Helpers.createInverseAtomizedPrices(DATA)[2],
    },
  ];

  // Test globals
  let priceFeedContract;


  before('Check accounts', (done) => {
    assert.equal(accounts.length, 10);
    done();
  });

  it('Deploy smart contract', (done) => {
    PriceFeed.new().then((result) => {
      priceFeedContract = result;
      return priceFeedContract.fee();
    }).then((result) => {
      assert.equal(result.toNumber(), SolConstants.INITIAL_FEE);
    }).then(() => {
      done();
    });
  });

  it('Get not existent price', (done) => {
    priceFeedContract.getPrice('', { from: NOT_OWNER }).then((result) => {
      assert.equal(result.toNumber(), 0);
      done();
    });
  });

  it('Set multiple price', (done) => {
    const addresses = [priceFeedTestCases[0].address, priceFeedTestCases[1].address, priceFeedTestCases[2].address];
    const inverseAtomizedPrices = [priceFeedTestCases[0].price, priceFeedTestCases[1].price, priceFeedTestCases[2].price];
    priceFeedContract.setPrice(addresses, inverseAtomizedPrices, { from: OWNER })
        .then(() => priceFeedContract.lastUpdate())
        .then((result) => {
          assert.notEqual(result.toNumber(), 0);
          done();
        });
  });

  it('Get multiple existent prices', (done) => {
    async.mapSeries(
      priceFeedTestCases,
      (testCase, callbackMap) => {
        priceFeedContract.getPrice(testCase.address, { from: NOT_OWNER })
            .then((result) => {
              assert.notEqual(result, testCase.price);
              callbackMap(null, testCase);
            });
      },
    (err, results) => {
      priceFeedTestCases = results;
      done();
    });
  });
});
