const SimpleMarket = artifacts.require('SimpleMarket');
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
  let mlnToken;
  let simpleMarket;
  let participation;
  let riskManagement;
  let sphere;

  before('Deploy contract instances', async () => {
    mlnToken = await PreminedAsset.new(
      'Melon', 'MLN', 18, 10 ** 18, { from: accounts[0] });
    version = await Version.new('', '', mlnToken.address);
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
      'Cantaloot',        // name
      mlnToken.address,   // reference asset
      0,                  // mgmt reward
      0,                  // perf reward
      participation.address,
      riskManagement.address,
      sphere.address,
      { from: accounts[6], gas: 6913095 }
    );
  });

  it('Can retrieve fund from index', async () => {
    const fundId = await version.getLastFundId();
    assert.equal(fundId.toNumber(), 0);
    const fundAddr = await version.getFundById(fundId);
    const fund = await Fund.at(fundAddr);
    assert.equal(await fund.getDecimals(), 18);
    assert.equal(await fund.getBaseUnits(), 10 ** 18);
  });

  it('Can remove a fund', async () => {
    const fundId = await version.getLastFundId();
    await version.shutDownFund(fundId);
  });
});
