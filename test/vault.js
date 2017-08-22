const EtherToken = artifacts.require('EtherToken');
const PreminedAsset = artifacts.require('PreminedAsset');
const PriceFeed = artifacts.require('DataFeed');
const Exchange = artifacts.require('SimpleMarket');
const Logger = artifacts.require('Logger');
const Participation = artifacts.require('Participation');
const RiskMgmt = artifacts.require('RiskMgmt');
const Vault = artifacts.require('Vault');
const chai = require('chai');
const rpc = require('../utils/rpc.js');

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

  before('Set up new Vault', async () => {
    ethToken = await EtherToken.new({ from: liquidityProvider });
    eurToken = await PreminedAsset.new(
      'Euro', 'EUR', 8, 10 ** 18, { from: liquidityProvider });
    mlnToken = await PreminedAsset.new(
      'Melon', 'MLN', 18, 10 ** 18, { from: liquidityProvider });
    pricefeed = await PriceFeed.new(mlnToken.address, 0, 60);
    const someBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
    pricefeed.register(ethToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    pricefeed.register(eurToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    pricefeed.register(mlnToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    await pricefeed.update(
      [ethToken.address, eurToken.address, mlnToken.address],
      [1000000000000000000, 5091131249363608, 226244343891402714], // mock data
    );
    exchange = await Exchange.deployed();
    participation = await Participation.deployed();
    riskManagement = await RiskMgmt.deployed();
    logger = await Logger.deployed();
    vault = await Vault.new(
      owner,
      'Melon Portfolio',  // name
      'MLN-P',            // share symbol
      18,                 // share decimals
      pricefeed.address,
      mlnToken.address,
      pricefeed.address,
      participation.address,
      exchange.address,
      riskManagement.address,
      logger.address,
      { from: owner },
    );
    participation.list(investor);   // whitelist investor
    logger.addPermission(vault.address);
  });

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
      const reqEvent = logger.SubscribeRequest();
      reqEvent.get((err, events) => {
        if (err) throw err;
        assert.equal(events.length, 1);
        done();
      });
    });
    it('allows execution of subscribe request', async () => {
      await rpc.mineBlock();
      await pricefeed.update(
        [ethToken.address, eurToken.address, mlnToken.address],
        [10 ** 18, 10 ** 18, 10 ** 18], // Mock data
      );   // pass update number check
      await rpc.mineBlock();
      await pricefeed.update(
        [ethToken.address, eurToken.address, mlnToken.address],
        [10 ** 18, 10 ** 18, 10 ** 18], // Mock data
      );
      const id = await vault.lastRequestId();
      await vault.executeRequest(id);
      assert.equal((await vault.balanceOf(investor)).toNumber(), resShares);
    });
    it('logs share creation', (done) => {
      const subEvent = logger.Subscribed();
      subEvent.get((err, events) => {
        if (err) throw err;
        assert.equal(events.length, 1);
        done();
      });
    });
    it('performs calculation correctly', async () => {
      await rpc.mineBlock();
      await pricefeed.update(
        [ethToken.address, eurToken.address, mlnToken.address],
        [10 ** 18, 10 ** 18, 10 ** 18], // Mock data
      );
      const [gav, , , unclaimedRewards, nav, sharePrice] =
        await vault.performCalculations();
      assert.equal(gav.toNumber(), offeredValue);
      assert.equal(unclaimedRewards.toNumber(), 0);
      assert.equal(nav.toNumber(), offeredValue);
      assert.equal(sharePrice.toNumber(), 10 ** 18);
    });
  });

  describe.skip('#annihilateShares()', () => {
    const numShares = 10000;
    const resShares = 0;
    const requestedValue = 10000;
    it('annihilates shares of vault with reference asset', async (done) => {
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
