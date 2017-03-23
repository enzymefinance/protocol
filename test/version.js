const assert = require('assert');
const Universe = artifacts.require('./Universe.sol');
const RiskMgmt = artifacts.require('./RiskMgmt.sol');
const Version = artifacts.require('./Version.sol');
const Core = artifacts.require('./Core.sol');


contract('Version', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const ADDRESS_PLACEHOLDER = '0x0';

  // Test globals
  let universeContract;
  let riskmgmtContract;
  let versionContract;
  let coreContract;

  before('Init contract instances', () => {
    Universe.deployed().then((deployed) => { universeContract = deployed; });
    RiskMgmt.deployed().then((deployed) => { riskmgmtContract = deployed; });
    Version.deployed().then((deployed) => { versionContract = deployed; });
  });

  it('Create a Core contract through the Version contract', (done) => {
    Version.new(ADDRESS_PLACEHOLDER)
    .then((result) => {
      versionContract = result;
      return versionContract.createCore(
        universeContract.address,
        riskmgmtContract.address,
        ADDRESS_PLACEHOLDER,
        ADDRESS_PLACEHOLDER,
        { from: OWNER });
    })
    .then(() => versionContract.numCreatedCores())
    .then((result) => {
      assert.strictEqual(result.toNumber(), 1);
      return versionContract.coreAt(0);
    })
    .then((result) => {
      coreContract = Core.at(result);
      return coreContract.owner();
    })
    .then((result) => {
      assert.equal(OWNER, result, 'Core.owner != OWNER!');
      done();
    });
  });
});
