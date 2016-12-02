var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');
var Helpers = require('../lib/Helpers.js');
var SolKeywords = require('../lib/SolKeywords.js');

contract('Net Asset Value', (accounts) => {

  // Contract constants
  const PREMINED_PRECISION = new BigNumber(Math.pow(10,8));
  const PREMINED_AMOUNT = new BigNumber(Math.pow(10,10));

  // Test constants
  const INITIAL_OFFER_ID = 0;
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const NUM_OFFERS = 3;
  const ALLOWANCE_AMOUNT = PREMINED_AMOUNT / 10;

  // Test globals
  let contract;
  let contractAddress;
  let etherTokenContract;
  let etherTokenAddress;
  let bitcoinTokenContract, bitcoinTokenAddress,
    dollarTokenContract, dollarTokenAddress,
    euroTokenContract, euroTokenAddress;
  let testCases;

  before('Check accounts', (done) => {
    assert.equal(accounts.length, 10);

    EtherToken.new({ from: OWNER }).then((result) => {
    }).then((result) => {
      return BitcoinToken.new({ from: OWNER });
    }).then((result) => {
      return DollarToken.new({ from: OWNER });
    }).then((result) => {
      return EuroToken.new({ from: OWNER });
    }).then((result) => {
      return PriceFeed.new({ from: OWNER });
    }).then((result) => {
      return Exchange.new({ from: OWNER });
    }).then((result) => {
      return Registrar.new([], [], [], { from: OWNER });
    }).then((result) => {
      done();
    });
  });

  it('Deploy smart contract', (done) => {
    Core.new().then((result) => {
      contract = result;
      contractAddress = contract.address;
      return contract.sumInvested();
    }).then((result) => {
      assert.equal(result.toNumber(), 0);
      done();
    });
  });

});
