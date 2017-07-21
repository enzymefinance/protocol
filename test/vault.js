const EtherToken = artifacts.require('EtherToken');
const PreminedAsset = artifacts.require('PreminedAsset');
const PriceFeed = artifacts.require('PriceFeed');
const Exchange = artifacts.require('Exchange');
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
  const owner = accounts[0];
  const investor = accounts[1];
  let ethToken;
  let vault;

  before('Set up new portfolio', async () => {
    // TODO: outsource all of these deployments to util function(s)
    const mln = tokens.find(t => t.symbol === 'MLN-T');
    const eur = tokens.find(t => t.symbol === 'EUR-T');
    mlnToken = await PreminedAsset.new(mln.name, mln.symbol, mln.decimals, premined);
    eurToken = await PreminedAsset.new(eur.name, eur.symbol, eur.decimals, premined);
    ethToken = await EtherToken.new();
    pricefeed = await PriceFeed.new(investor, ethToken.address);
    exchange = await Exchange.new();
    universe = await Universe.new(
      [ethToken.address, mlnToken.address, eurToken.address],
      [pricefeed.address, pricefeed.address, pricefeed.address],
      [exchange.address, exchange.address, exchange.address],
    );
    participation = await Participation.new();
    riskManagement = await RiskMgmt.new();
    rewards = await Rewards.new();
    vault = await Vault.new(
      owner,
      'Melon Portfolio',  // name
      'MLN-P',            // share symbol
      18,                 // share decimals
      universe.address,
      participation.address,
      riskManagement.address,
      rewards.address,
      { from: owner },
    );
  });

  describe.skip('#createShares()', () => {
    const wantedShares = 10000;
    const offeredValue = 10000;
    it('Creates shares of empty vault with reference asset', async () => {
      await ethToken.approve(vault.address, offeredValue, { from: investor });
      await vault.subscribeWithReferenceAsset(wantedShares, offeredValue);
      assert.equal(await vault.balanceOf(investor), wantedShares);
    });
  });

  describe.skip('#annihilateShares()', () => {

  });
});
