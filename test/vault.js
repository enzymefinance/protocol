const EtherToken = artifacts.require('EtherToken');
const PreminedAsset = artifacts.require('PreminedAsset');
const DataFeed = artifacts.require('DataFeed');
const Exchange = artifacts.require('Exchange');
const Logger = artifacts.require('Logger');
const Universe = artifacts.require('Universe');
const Participation = artifacts.require('Participation');
const RiskMgmt = artifacts.require('RiskMgmt');
const Rewards = artifacts.require('Rewards');
const Vault = artifacts.require('Vault');
const tokens = require('../migrations/config/token_info').kovan;
const chai = require('chai');

const assert = chai.assert;

contract('Vault', (accounts) => {
  const premined = Math.pow(10, 28);
  const decimals = 18;
  const owner = accounts[0];
  const liquidityProvider = accounts[1];
  const investor = accounts[2];
  let ethToken;
  let vault;
  let logger;

  before('Set up new portfolio', async () => {
    return; // Skip before
    // TODO: outsource all of these deployments to util function(s)
    const mln = tokens.find(t => t.symbol === 'MLN-T');
    const eur = tokens.find(t => t.symbol === 'EUR-T');
    mlnToken = await PreminedAsset.new(
      mln.name, mln.symbol, mln.decimals, premined, { from: liquidityProvider });
    eurToken = await PreminedAsset.new(
      eur.name, eur.symbol, eur.decimals, premined, { from: liquidityProvider });
    ethToken = await EtherToken.new({ from: liquidityProvider });
    pricefeed = await DataFeed.new(investor, ethToken.address);
    await pricefeed.update(
      [ethToken.address, eurToken.address, mlnToken.address],
      [1000000000000000000, 5091131249363608, 226244343891402714], // Mock data
    );
    exchange = await Exchange.new();
    universe = await Universe.new(
      mlnToken.address,
      [ethToken.address, eurToken.address, mlnToken.address],
      pricefeed.address,
      exchange.address,
    );
    participation = await Participation.new();
    riskManagement = await RiskMgmt.new();
    rewards = await Rewards.new();
    logger = await Logger.new();
    vault = await Vault.new(
      owner,
      'Melon Portfolio',  // name
      'MLN-P',            // share symbol
      decimals,           // share decimals
      mlnToken.address,
      universe.address,
      participation.address,
      riskManagement.address,
      rewards.address,
      logger.address,
      { from: owner },
    );
  });

  describe('#createShares()', () => {
    const numShares = 10000;
    const resShares = 10000;
    const offeredValue = 10000;
    it.skip('Vault has been initialised', async () => {
      const baseUnitsPerShare = await vault.baseUnitsPerShare();
      assert.equal(decimals, await vault.decimals());
      assert.equal(baseUnitsPerShare, Math.pow(10, decimals));
    });
    it.skip('Receives token from liquidity provider', async () => {
      await ethToken.transfer(investor, offeredValue, { from: liquidityProvider });
      assert.equal((await ethToken.balanceOf(investor)).toNumber(), offeredValue);
    });
    it.skip('Creates shares of empty vault with reference asset', async () => {
      await ethToken.approve(vault.address, offeredValue, { from: investor });
      await vault.subscribe(numShares, offeredValue, { from: investor });
      assert.equal((await vault.balanceOf(investor)).toNumber(), resShares);
    });
    it.skip('Performs calculation correctly', async () => {
      const [gav, , , unclaimedRewards, nav, sharePrice] =
        await vault.performCalculations();
      assert.equal(gav.toNumber(), offeredValue);
      assert.equal(unclaimedRewards.toNumber(), 0);
      assert.equal(nav.toNumber(), offeredValue);
      assert.equal(sharePrice.toNumber(), Math.pow(10, decimals));
    });
    it.skip('Logs share creation', () => {
      const subEvent = logger.Subscribed();
      subEvent.get((err, events) => {
        if (err) throw err;
        assert.equal(events.length, 1);
      });
    });
  });

  describe.skip('#annihilateShares()', () => {
    const numShares = 10000;
    const resShares = 0;
    const requestedValue = 10000;
    it('Annihilates shares of vault with reference asset', async (done) => {
      await ethToken.approve(vault.address, requestedValue, { from: investor });
      await vault.redeem(numShares, requestedValue, { from: investor });
      assert.equal((await vault.balanceOf(investor)).toNumber(), resShares);
      done();
    });
    it('Logs redemption', () => {
      const redeemEvent = logger.Redeemed();
      redeemEvent.get((err, events) => {
        if (err) throw err;
        assert.equal(events.length, 1);
      });
    });
    it('Performs calculations correctly', async () => {
      const [gav, , , unclaimedRewards, nav, sharePrice] =
        await vault.performCalculations();
      assert.equal(gav.toNumber(), 0);
      assert.equal(unclaimedRewards.toNumber(), 0);
      assert.equal(nav.toNumber(), 0);
      assert.equal(sharePrice.toNumber(), Math.pow(10, decimals));
    });
  });
});
