const assert = require('assert');
const Universe = artifacts.require('./Universe.sol');
const Subscribe = artifacts.require('./Subscribe.sol');
const Redeem = artifacts.require('./Redeem.sol');
const RiskMgmt = artifacts.require('./RiskMgmt.sol');
const ManagementFee = artifacts.require('ManagementFee.sol');
const PerformanceFee = artifacts.require('PerformanceFee.sol');
const Version = artifacts.require('./Version.sol');
const Core = artifacts.require('./Core.sol');


contract('Version', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const PORTFOLIO_NAME = 'Melon Portfolio';
  const ADDRESS_PLACEHOLDER = '0x0';
  const INITIAL_CORE_INDEX = 1;

  // Test globals
  let universeContract;
  let subscribeContract;
  let redeemContract;
  let riskmgmtContract;
  let managementFeeContract;
  let performanceFeeContract;
  let versionContract;
  let coreContract;

  before('Init contract instances', () => {
    Universe.deployed().then((deployed) => { universeContract = deployed; });
    Subscribe.deployed().then((deployed) => { subscribeContract = deployed; });
    Redeem.deployed().then((deployed) => { redeemContract = deployed; });
    RiskMgmt.deployed().then((deployed) => { riskmgmtContract = deployed; });
    ManagementFee.deployed().then((deployed) => { managementFeeContract = deployed; });
    PerformanceFee.deployed().then((deployed) => { performanceFeeContract = deployed; });
    Version.deployed().then((deployed) => { versionContract = deployed; });
  });

  it('Create a Core contract through the Version contract', (done) => {
    Version.new(ADDRESS_PLACEHOLDER)
    .then((result) => {
      versionContract = result;
      return versionContract.createCore(
        PORTFOLIO_NAME,
        universeContract.address,
        subscribeContract.address,
        redeemContract.address,
        riskmgmtContract.address,
        managementFeeContract.address,
        performanceFeeContract.address,
        { from: OWNER });
    })
    .then(() => versionContract.getLastCoreId())
    .then((result) => {
      assert.strictEqual(result.toNumber(), INITIAL_CORE_INDEX);
      return versionContract.getCore(INITIAL_CORE_INDEX);
    })
    .then((result) => {
      const [coreAddress, ownerAddress, isActive] = result;
      assert.strictEqual(isActive, true);
      coreContract = Core.at(coreAddress);
      return coreContract.owner();
    })
    .then((result) => {
      assert.equal(result, OWNER, 'Core.owner != OWNER!');
      return versionContract.annihilateCore(INITIAL_CORE_INDEX, { from: OWNER });
    })
    .then(() => versionContract.getCore(INITIAL_CORE_INDEX))
    .then((result) => {
      const [coreAddress, ownerAddress, isActive] = result;
      assert.strictEqual(isActive, false);
      done();
    });
  });
});
