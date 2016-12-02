var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');
var Helpers = require('../lib/Helpers.js');
var SolKeywords = require('../lib/SolKeywords.js');
var SolConstants = require('../lib/SolConstants.js');


contract('Meta', (accounts) => {

  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];

  // Test globals
  let contract,
    coreContract;


  it("Create a Core contract through the Meta contract",(done) => {
    Meta.new().then((result) => {
      contract = result;
      return Meta.createPortfolio(
      EtherToken.address,
      Registrar.address,
      { from: OWNER });
    }).then((result) => {
      return Meta.numPortfolios();
    }).then((result) => {
      assert.strictEqual(result.toNumber(), 1);
      return Meta.portfolios(0);
    }).then((result) => {
      coreContract = Core.at(result);
      return coreContract.owner();
    }).then((result) => {
      assert.equal(OWNER, result, "Core.owner != OWNER!");
    }).then(done).catch(done);
  });

});
