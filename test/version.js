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
    coreContract;


  it("Create a Core contract through the Version contract",(done) => {
    Version.new(ADDRESS_PLACEHOLDER).then((result) => {
      contract = result;
      return contract.createPortfolio(ADDRESS_PLACEHOLDER, ADDRESS_PLACEHOLDER,
        ADDRESS_PLACEHOLDER, ADDRESS_PLACEHOLDER,{ from: OWNER });
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
