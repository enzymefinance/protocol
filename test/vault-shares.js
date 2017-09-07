const EtherToken = artifacts.require('EtherToken');
const PreminedAsset = artifacts.require('PreminedAsset');
const PriceFeed = artifacts.require('DataFeed');
const Exchange = artifacts.require('SimpleMarket');
const Participation = artifacts.require('Participation');
const RiskMgmt = artifacts.require('RiskMgmt');
const Sphere = artifacts.require('Sphere');
const Vault = artifacts.require('Vault');
const chai = require('chai');
const rpc = require('../utils/rpc.js');

const assert = chai.assert;

contract('Vault shares', (accounts) => {
  const liquidityProvider = accounts[1];
  const investor = accounts[2];
  let ethToken;
  let vault;

  before('Set up new Vault', async () => {
    ethToken = await EtherToken.new({ from: liquidityProvider });
    eurToken = await PreminedAsset.new(
      'Euro', 'EUR', 8, 10 ** 18, { from: liquidityProvider });
    mlnToken = await PreminedAsset.new(
      'Melon', 'MLN', 18, 10 ** 18, { from: liquidityProvider });
    pricefeed = await PriceFeed.new(mlnToken.address, 0, 60);
    exchange = await Exchange.deployed();
    sphere = await Sphere.new(pricefeed.address, exchange.address);
    const someBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
    pricefeed.register(ethToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    pricefeed.register(eurToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    pricefeed.register(mlnToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    await pricefeed.update(
      [ethToken.address, eurToken.address, mlnToken.address],
      [1000000000000000000, 5091131249363608, 226244343891402714], // mock data
    );
    participation = await Participation.deployed();
    riskManagement = await RiskMgmt.deployed();
    vault = await Vault.new(
      accounts[0],
      'Melon Portfolio',  // name
      'MLN-P',            // share symbol
      18,                 // share decimals
      mlnToken.address,
      participation.address,
      riskManagement.address,
      sphere.address,
      { from: accounts[0] },
    );
    participation.list(investor);   // whitelist investor
  });

  function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // convenience function
  async function simulateFeedUpdate() {
    await rpc.mineBlock();
    await timeout(3000);
    await pricefeed.update(
      [ethToken.address, eurToken.address, mlnToken.address],
      [10 ** 18, 10 ** 18, 10 ** 18],
    );
  }

  describe('#createShares()', () => {
    const numShares = 10000;
    const resShares = 10000;
    const offeredValue = 10000;
    const incentive = 100;
    it('investor receives token from liquidity provider', async () => {
      await mlnToken.transfer(investor, offeredValue + incentive, { from: liquidityProvider });
      assert.equal((await mlnToken.balanceOf(investor)).toNumber(), offeredValue + incentive);
    });
    it('allows subscribe request', async () => {
      await mlnToken.approve(vault.address, offeredValue + incentive, { from: investor });
      const allowance = await mlnToken.allowance(investor, vault.address);
      assert.equal(allowance.toNumber(), offeredValue + incentive);
      await vault.subscribe(numShares, offeredValue, incentive, { from: investor });
    });
    it('logs request event', (done) => {
      const reqEvent = vault.SubscribeRequest();
      reqEvent.get((err, events) => {
        if (err) throw err;
        assert.equal(events.length, 1);
        done();
      });
    });
    it('allows execution of subscribe request', async () => {
      await simulateFeedUpdate();
      await simulateFeedUpdate();
      const id = await vault.getLastRequestId();
      await vault.executeRequest(id);
      assert.equal((await vault.balanceOf(investor)).toNumber(), resShares);
    });
    it('logs share creation', (done) => {
      const subEvent = vault.Subscribed();
      subEvent.get((err, events) => {
        if (err) throw err;
        assert.equal(events.length, 1);
        done();
      });
    });
    it('performs calculation correctly', async () => {
      await simulateFeedUpdate();
      const [gav, , , unclaimedRewards, nav, sharePrice] =
        await vault.performCalculations();
      assert.equal(gav.toNumber(), offeredValue);
      assert.equal(unclaimedRewards.toNumber(), 0);
      assert.equal(nav.toNumber(), offeredValue);
      assert.equal(sharePrice.toNumber(), 10 ** 18);
    });
  });

  describe('#annihilateShares()', () => {
    const numShares = 10000;
    const requestedValue = 10000;
    const incentive = 100;
    it('investor receives token from liquidity provider', async () => {
      await mlnToken.transfer(investor, requestedValue + incentive, { from: liquidityProvider });
      assert.equal((await mlnToken.balanceOf(investor)).toNumber(), requestedValue + incentive);
    });
    it('allows redeem request', async () => {
      await mlnToken.approve(vault.address, requestedValue + incentive, { from: investor });
      await vault.redeem(numShares, requestedValue, incentive, { from: investor });
    });
    it('annihilates shares and returns funds on redeem execution', async () => {
      await simulateFeedUpdate(); // fake 2 new blocks and updates
      await simulateFeedUpdate();
      const id = await vault.getLastRequestId();
      await vault.executeRequest(id);
      assert.equal((await vault.balanceOf(investor)).toNumber(), 0);
    });
    it('logs redemption', () => {
      const redeemEvent = vault.Redeemed();
      redeemEvent.get((err, events) => {
        if (err) throw err;
        assert.equal(events.length, 1);
      });
    });
    it('performs calculations correctly', async () => {
      const [gav, , , unclaimedRewards, nav, sharePrice] =
        await vault.performCalculations();
      assert.equal(gav.toNumber(), 0);
      assert.equal(unclaimedRewards.toNumber(), 0);
      assert.equal(nav.toNumber(), 0);
      assert.equal(sharePrice.toNumber(), 10 ** 18);
    });
  });
});
