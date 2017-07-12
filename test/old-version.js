const assert = require('assert');
const Universe = artifacts.require('./Universe.sol');
const RiskMgmt = artifacts.require('./RiskMgmt.sol');
const Rewards = artifacts.require('./Rewards.sol');
const Version = artifacts.require('./Version.sol');
const Vault = artifacts.require('./Vault.sol');


describe.skip('Old', () => {
contract('Version', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const PORTFOLIO_NAME = 'Melon Portfolio';
  const PORTFOLIO_SYMBOL = 'MLN-P';
  const PORTFOLIO_DECIMALS = 18;
  const ADDRESS_PLACEHOLDER = '0x0';
  const INITIAL_CORE_INDEX = 1;

  // Test globals
  let universeContract;
  let subscribeContract;
  let redeemContract;
  let riskmgmtContract;
  let rewardsContract;
  let versionContract;
  let coreContract;

  before('Init contract instances', () => {
    Universe.deployed().then((deployed) => { universeContract = deployed; });
    RiskMgmt.deployed().then((deployed) => { riskmgmtContract = deployed; });
    Rewards.deployed().then((deployed) => { rewardsContract = deployed; });
    Version.deployed().then((deployed) => { versionContract = deployed; });
  });

  it('Create a Vault contract through the Version contract', (done) => {
    Version.new(ADDRESS_PLACEHOLDER)
    .then((result) => {
      versionContract = result;
      return versionContract.createVault(
        PORTFOLIO_NAME,
        PORTFOLIO_SYMBOL,
        PORTFOLIO_DECIMALS,
        universeContract.address,
        riskmgmtContract.address,
        rewardsContract.address,
        { from: OWNER });
    })
    .then(() => versionContract.getLastVaultId())
    .then((result) => {
      assert.strictEqual(result.toNumber(), INITIAL_CORE_INDEX);
      return versionContract.getVault(INITIAL_CORE_INDEX);
    })
    .then((info) => {
      const [address, owner, name, symbol, decimals, isActive] = info;
      assert.strictEqual(isActive, true);
      coreContract = Vault.at(address);
      return coreContract.owner();
    })
    .then((result) => {
      assert.equal(result, OWNER, 'Vault.owner != OWNER!');
      return versionContract.annihilateVault(INITIAL_CORE_INDEX, { from: OWNER });
    })
    .then(() => versionContract.getVault(INITIAL_CORE_INDEX))
    .then((info) => {
      const [address, owner, name, symbol, decimals, isActive] = info;
      assert.strictEqual(isActive, false);
      done();
    });
  });
});
})
