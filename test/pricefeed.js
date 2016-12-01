var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');


contract('PriceFeed', (accounts) => {

  // Solidity constants
  const ether = new BigNumber(Math.pow(10,18));

  // Contract constants
  const OWNER = accounts[0];
  const INITIAL_FEE = 0;
  const PREMINED_PRECISION = new BigNumber(Math.pow(10,8));
  const PREMINED_AMOUNT = new BigNumber(Math.pow(10,10));

  // Test constants
  const NOT_OWNER = accounts[1];
  // Set price of fungible relative to Ether
  /** Ex:
   *  Let asset == UST, let Value of 1 UST := 1 USD == 0.080456789 ETH
   *  and let precision == 8,
   *  => assetPrices[UST] = 08045678
   */
  var data = {"BTC":0.01117,"USD":8.45,"EUR":7.92};
  const prices = [
    1.0 / data['BTC'] * PREMINED_PRECISION,
    1.0 / data['USD'] * PREMINED_PRECISION,
    1.0 / data['EUR'] * PREMINED_PRECISION
  ];
  console.log(prices);
  let testCases = [
    {
      address: "0x0000000000000000000000000000000000000000",
      price: prices[0],
    },
    {
      address: "0x0000000000000000000000000000000000000001",
      price: prices[1],
    },
    {
      address: "0x0000000000000000000000000000000000000002",
      price: prices[2],
    },
  ];

  // Test globals
  let contract;
  let contractAddress;


  before('Check accounts', (done) => {
    assert.equal(accounts.length, 10);
    done();
  });

  it('Deploy smart contract', (done) => {
    PriceFeed.new().then((result) => {
      contract = result;
      contractAddress = contract.address;
      return contract.fee();
    }).then((result) => {
      assert.equal(result.toNumber(), INITIAL_FEE)
    }).then((result) => {
      done();
    });
  });

  it('Get not existent price', (done) => {
    contract.getPrice("", { from: NOT_OWNER }).then((result) => {
      assert.equal(result.toNumber(), 0);
      done();
    });
  });

  it('Set multiple price', (done) => {
    const addresses = [testCases[0].address, testCases[1].address, testCases[2].address];
    const prices = [testCases[0].price, testCases[1].price, testCases[2].price];
    contract.setPrice(addresses, prices, { from: OWNER }).then((result) => {
      return contract.lastUpdate();
    }).then((result) => {
      assert.notEqual(result.toNumber(), 0);
      done();
    });
  });

  it('Get multiple existent prices', (done) => {
    async.mapSeries(
      testCases,
      (testCase, callbackMap) => {
      contract.getPrice(testCase.address, { from: NOT_OWNER }
      ).then((result) => {
        assert.notEqual(result, testCase.price);
        callbackMap(null, testCase);
      });
    },
    (err, results) => {
      testCases = results;
      done();
    });
  });
});
