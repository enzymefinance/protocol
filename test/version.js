const EtherToken = artifacts.require('EtherToken');
const Exchange = artifacts.require('Exchange');
const Governance = artifacts.require('Governance');
const Logger = artifacts.require('Logger');
const Participation = artifacts.require('Participation');
const PreminedAsset = artifacts.require('PreminedAsset');
const PriceFeed = artifacts.require('PriceFeed');
const Rewards = artifacts.require('Rewards');
const RiskMgmt = artifacts.require('RiskMgmt');
const Universe = artifacts.require('Universe');
const Version = artifacts.require('Version');
const tokens = require('../migrations/config/token_info').kovan;
const chai = require('chai');

const assert = chai.assert;

contract('Version', (accounts) => {
  const premined = Math.pow(10, 28);
  const managementRewardRate = 0; // Reward rate in referenceAsset per delta improvment
  const performanceRewardRate = 0; // Reward rate in referenceAsset per managed seconds

  let governance;
  let logger;
  let version;

  before('Deploy contract instances', async () => {
  });

  it.skip('Can create a vault without error', async () => {
    await version.setupVault( // TODO: Uses too much gas for current settings
      'Cantaloot',    // name
      'CNLT',         // share symbol
      18,             // share decimals
      universe.address,
      participation.address,
      riskManagement.address,
      rewards.address,
      { from: accounts[0] },
    );
  });

  it.skip('Can retrieve vault from index', async () => {
    let vaultId = await version.getLastVaultId();
    let [, vaultOwner, , , , isActive] = await version.getVault(vaultId);
    console.log(isActive);
    assert(isActive);
    assert.equal(vaultOwner, accounts[0]);
  });

  it.skip('Can remove a vault', async () => {
    let vaultId = await version.getLastVaultId();
    await version.decommissionVault(vaultId);
  });
});
