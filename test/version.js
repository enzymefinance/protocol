var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');
var Helpers = require('../lib/Helpers.js');
var SolKeywords = require('../lib/SolKeywords.js');
var SolConstants = require('../lib/SolConstants.js');


contract('Version', (accounts) => {

  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const ADDRESS_PLACEHOLDER = "0x0";

  // Test globals
  let contract,
    coreContract,
    etherTokenContract,
    bitcoinTokenContract,
    dollarTokenContract,
    euroTokenContract,
    priceFeedContract,
    exchangeContract,
    registrarContract,
    tradingContract;

  before('Check accounts, deploy modules, set testcase', (done) => {
    assert.equal(accounts.length, 10);

    EtherToken.new({ from: OWNER }).then((result) => {
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
          etherTokenContract.address,
          bitcoinTokenContract.address,
          dollarTokenContract.address,
          euroTokenContract.address
        ], [
          priceFeedContract.address,
          priceFeedContract.address,
          priceFeedContract.address,
          priceFeedContract.address,
        ], [
          exchangeContract.address,
          exchangeContract.address,
          exchangeContract.address,
          exchangeContract.address,
        ], { from: OWNER }
      );
    }).then((result) => {
      registrarContract = result;
      return Trading.new(exchangeContract.address, { from: OWNER });
    }).then((result) => {
      tradingContract = result;
      done();
    });
  });

  it("Create a Core contract through the Version contract",(done) => {
    Version.new(ADDRESS_PLACEHOLDER).then((result) => {
      contract = result;
      return contract.createPortfolio(registrarContract.address,
        tradingContract.address,
        ADDRESS_PLACEHOLDER,
        ADDRESS_PLACEHOLDER,
        { from: OWNER });
    }).then((result) => {
      return contract.numPortfolios();
    }).then((result) => {
      assert.strictEqual(result.toNumber(), 1);
      return contract.portfolios(0);
    }).then((result) => {
      coreContract = Core.at(result);
      return coreContract.owner();
    }).then((result) => {
      /*TODO Set Owner of Portfolio equal to Portfolio creator */
      // assert.equal(OWNER, result, "Core.owner != OWNER!");
    }).then(done).catch(done);
  });

});
