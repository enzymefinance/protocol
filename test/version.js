const EtherToken = artifacts.require('EtherToken');
const Exchange = artifacts.require('SimpleMarket');
const Governance = artifacts.require('Governance');
const Logger = artifacts.require('Logger');
const Participation = artifacts.require('Participation');
const PreminedAsset = artifacts.require('PreminedAsset');
const DataFeed = artifacts.require('DataFeed');
const RiskMgmt = artifacts.require('RiskMgmt');
const Version = artifacts.require('Version');
const chai = require('chai');

const assert = chai.assert;

contract('Version', (accounts) => {
  let logger;
  let version;
  let feed;

  before('Deploy contract instances', async () => {
    ethToken = await EtherToken.new({ from: accounts[0] });
    eurToken = await PreminedAsset.new(
      'Euro', 'EUR', 8, 10 ** 18, { from: accounts[0] });
    mlnToken = await PreminedAsset.new(
      'Melon', 'MLN', 18, 10 ** 18, { from: accounts[0] });
    version = await Version.deployed();
    feed = await DataFeed.new(mlnToken.address, [eurToken.address, ethToken.address]);
    exchange = await Exchange.new();
    participation = await Participation.new();
    riskManagement = await RiskMgmt.new();
  });

  it('Can create a vault without error', async () => {
    await version.setupVault(
      'Cantaloot',    // name
      'CNLT',         // share symbol
      18,             // share decimals
      feed.address,
      exchange.address,
      participation.address,
      riskManagement.address,
      { from: accounts[0], gas: 6713095 }
    );
  });

  it('Can retrieve vault from index', async () => {
    let vaultId = await version.getLastVaultId();
    assert.equal(vaultId.toNumber(), 0);
  });

  it('Can remove a vault', async () => {
    let vaultId = await version.getLastVaultId();
    await version.decommissionVault(vaultId);
  });
});
