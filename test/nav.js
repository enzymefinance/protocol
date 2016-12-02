var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');
var Helpers = require('../lib/Helpers.js');
var SolKeywords = require('../lib/SolKeywords.js');
var SolConstants = require('../lib/SolConstants.js');


contract('Net Asset Value', (accounts) => {

  // Test constants
  const INITIAL_OFFER_ID = 0;
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const NUM_OFFERS = 3;
  const ALLOWANCE_AMOUNT = SolConstants.PREMINED_AMOUNT / 10;

  // Test globals
  let contract,
    etherTokenContract,
    bitcoinTokenContract,
    dollarTokenContract,
    euroTokenContract,
    priceFeedContract,
    exchangeContract,
    registrarContract;
  let testCases;

  before('Check accounts', (done) => {
    assert.equal(accounts.length, 10);

    EtherToken.new({ from: OWNER }).then((result) => {
    }).then((result) => {
      etherTokenContract = result;
      return BitcoinToken.new({ from: OWNER });
    }).then((result) => {
      bitcoinTokenContract = result;
      return DollarToken.new({ from: OWNER });
    }).then((result) => {
      dollarTokenContract = result;
      return EuroToken.new({ from: OWNER });
    }).then((result) => {
      euroTokenContract = result;
      return PriceFeed.new({ from: OWNER });
    }).then((result) => {
      priceFeedContract = result;
      return Exchange.new({ from: OWNER });
    }).then((result) => {
      exchangeContract = result;
      return Registrar.new(
        [
          bitcoinTokenContract.address,
          dollarTokenContract.address,
          euroTokenContract.address
        ], [
          priceFeedContract.address,
          priceFeedContract.address,
          priceFeedContract.address,
        ], [
          exchangeContract.address,
          exchangeContract.address,
          exchangeContract.address,
        ], { from: OWNER }
      );
    }).then((result) => {
      registrarContract = result;
      done();
    });
  });

  it('Deploy smart contract', (done) => {
    Core.new().then((result) => {
      contract = result;
      return contract.sumInvested();
    }).then((result) => {
      assert.equal(result.toNumber(), 0);
      done();
    });
  });

});
