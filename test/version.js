const EtherToken = artifacts.require('EtherToken');
const SimpleMarket = artifacts.require('SimpleMarket');
const Governance = artifacts.require('Governance');
const Participation = artifacts.require('Participation');
const PreminedAsset = artifacts.require('PreminedAsset');
const DataFeed = artifacts.require('DataFeed');
const RiskMgmt = artifacts.require('RiskMgmt');
const Sphere = artifacts.require('Sphere');
const Version = artifacts.require('Version');
const Fund = artifacts.require('Fund');
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
    simpleMarket = await SimpleMarket.new();
    sphere = await Sphere.new(feed.address, simpleMarket.address);
    participation = await Participation.new();
    riskManagement = await RiskMgmt.new();
  });

  it('Can create a fund without error', async () => {
    await version.setupFund(
      'Cantaloot',    // name
      'CNLT',         // share symbol
      18,             // share decimals
      0,              // mgmt reward
      0,              // perf reward
      participation.address,
      riskManagement.address,
      sphere.address,
      { from: accounts[6], gas: 6713095 }
    );
  });

  it('Can retrieve fund from index', async () => {
    const fundId = await version.getLastFundId();
    assert.equal(fundId.toNumber(), 0);
    const fundAddr = await version.getFund(fundId);
    const fund = await Fund.at(fundAddr);
    assert.equal(await fund.getDecimals(), 18);
    assert.equal(await fund.getBaseUnits(), Math.pow(10, 18));
  });

  it('Can remove a fund', async () => {
    let fundId = await version.getLastFundId();
    await version.shutDownFund(fundId);
  });
});
