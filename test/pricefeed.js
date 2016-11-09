var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');
var sha256 = require('js-sha256').sha256;



contract('PriceFeed', (accounts) => {

  // CONSTANTS
  const INITIAL_FEE = 0;
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const TEST_CASES = [
    {
      address: "0x0000000000000000000000000000000000000000",
      price: new BigNumber(9.0909091e+16),
    },
    {
      address: "0x0000000000000000000000000000000000000001",
      price: new BigNumber(1e+17),
    },
    {
      address: "0x0000000000000000000000000000000000000002",
      price: new BigNumber(8.3333333e+16),
    },
  ];

  // GLOBALS
  let contract;
  let contractAddress;
  const ETHER = new BigNumber(Math.pow(10,18));


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
    const addresses = [TEST_CASES[0].address, TEST_CASES[1].address, TEST_CASES[2].address ];
    const prices = [TEST_CASES[0].price, TEST_CASES[1].price, TEST_CASES[2].price ];
    contract.setPrice(addresses, prices, { from: OWNER }).then((result) => {
      return contract.lastUpdate();
    }).then((result) => {
      assert.notEqual(result.toNumber(), 0);
      done();
    });
  });

  it('Get multiple existent prices', (done) => {
    async.mapSeries(TEST_CASES, (testCase, callbackMap) => {
      contract.getPrice(testCase.address, { from: NOT_OWNER }).then((result) => {
        assert.notEqual(result, testCase.price);
        callbackMap(null, testCase);
      });
    }, (err, result) => {
      testCases = result;
      done();
    });
  });
});
