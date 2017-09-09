const EtherToken = artifacts.require('EtherToken');
const Exchange = artifacts.require('SimpleMarket');
const Governance = artifacts.require('Governance');
const Participation = artifacts.require('Participation');
const PreminedAsset = artifacts.require('PreminedAsset');
const DataFeed = artifacts.require('DataFeed');
const RiskMgmt = artifacts.require('RiskMgmt');
const Sphere = artifacts.require('Sphere');
const Version = artifacts.require('Version');
const chai = require('chai');

const assert = chai.assert;

contract('Version', (accounts) => {
  let version;
  let feed;

  before('Deploy contract instances', async () => {
    ethToken = await EtherToken.new({ from: accounts[0] });
    eurToken = await PreminedAsset.new(
      'Euro', 'EUR', 8, 10 ** 18, { from: accounts[0] });
    mlnToken = await PreminedAsset.new(
      'Melon', 'MLN', 18, 10 ** 18, { from: accounts[0] });
    version = await Version.new(mlnToken.address);
    feed = await DataFeed.new(mlnToken.address, 0, 120);
    const someBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
    await feed.register(mlnToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    await feed.update([mlnToken.address], [226244343891402714]);
    exchange = await Exchange.new();
    sphere = await Sphere.new(feed.address, exchange.address);
    participation = await Participation.new();
    riskManagement = await RiskMgmt.new();
  });

  it('Can create a vault without error', async () => {
    await version.setupFund(
      'Cantaloot',    // name
      'CNLT',         // share symbol
      18,             // share decimals
      participation.address,
      riskManagement.address,
      sphere.address,
      { from: accounts[6], gas: 6713095 }
    );
  });

  it('Can retrieve vault from index', async () => {
    let vaultId = await version.getLastFundId();
    assert.equal(vaultId.toNumber(), 0);
  });

  it('Can remove a vault', async () => {
    let vaultId = await version.getLastFundId();
    await version.shutDownFund(vaultId);
  });
});
