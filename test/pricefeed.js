var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');
var Helpers = require('../lib/Helpers.js');
var SolKeywords = require('../lib/SolKeywords.js');


contract('PriceFeed', (accounts) => {

  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  let testCases = [
    {
      address: "0x0000000000000000000000000000000000000000",
      price: Helpers.inverseAtomizedPrices[0],
    },
    {
      address: "0x0000000000000000000000000000000000000001",
      price: Helpers.inverseAtomizedPrices[1],
    },
    {
      address: "0x0000000000000000000000000000000000000002",
      price: Helpers.inverseAtomizedPrices[2],
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
    const inverseAtomizedPrices = [testCases[0].price, testCases[1].price, testCases[2].price];
    contract.setPrice(addresses, inverseAtomizedPrices, { from: OWNER }).then((result) => {
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
