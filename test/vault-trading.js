const EtherToken = artifacts.require('EtherToken');
const PreminedAsset = artifacts.require('PreminedAsset');
const PriceFeed = artifacts.require('DataFeed');
const Exchange = artifacts.require('SimpleMarket');
const Participation = artifacts.require('Participation');
const RiskMgmt = artifacts.require('RiskMgmt');
const Sphere = artifacts.require('Sphere');
const Vault = artifacts.require('Vault');
const chai = require('chai');

const assert = chai.assert;

contract('Vault trading', (accounts) => {
  const manager = accounts[0];
  const liquidityProvider = accounts[1];
  const investor = accounts[2];
  let ethToken;
  let vault;
  let exchange;

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
    await pricefeed.register(ethToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    await pricefeed.register(eurToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    await pricefeed.register(mlnToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    await pricefeed.update(
      [ethToken.address, eurToken.address, mlnToken.address],
      [1000000000000000000, 5091131249363608, 226244343891402714], // mock data
    );
    participation = await Participation.deployed();
    riskManagement = await RiskMgmt.deployed();
    vault = await Vault.new(
      manager,
      'Melon Portfolio',  // name
      'MLN-P',            // share symbol
      18,                 // share decimals
      mlnToken.address,
      participation.address,
      riskManagement.address,
      sphere.address,
      { from: accounts[0] },
    );
    await participation.list(investor);   // whitelist investor
    await mlnToken.transfer(vault.address, 1000000, { from: accounts[1] }); // initialize balances
    await ethToken.transfer(vault.address, 1000000, { from: accounts[1] });
  });
  describe('#makeOrder', () => {
    const sellAmt = 10000;
    const buyAmt = 2000;
    it('creating order approves token spending for vault', async () => {
      const preMln = await mlnToken.balanceOf(vault.address);
      await vault.makeOrder(mlnToken.address, ethToken.address, sellAmt, buyAmt, { from: manager });
      const postMln = await mlnToken.balanceOf(vault.address);
      assert.equal(preMln - sellAmt, postMln);
    });
    it('makes an order with expected parameters', async () => {
      const id = await vault.getLastOrderId();
      const order = await vault.orders(id);
      assert.equal(order[0], mlnToken.address);
      assert.equal(order[1], ethToken.address);
      assert.equal(order[2].toNumber(), sellAmt);
      assert.equal(order[3].toNumber(), buyAmt);
      assert.equal(order[5].toNumber(), 0);
      assert.equal(order[6].toNumber(), 0);
    });
  });
  describe('#takeOrder', () => {
    const sellAmt = 20000;  // sell/buy from maker's perspective
    const buyAmt = 4000;
    before('make an order to take', async () => {
      await mlnToken.approve(exchange.address, sellAmt, { from: accounts[1] }); // make an order to take
      await exchange.make(
        mlnToken.address, ethToken.address, sellAmt, buyAmt, { from: accounts[1] },
      );
    });
    it('takes 100% of an order, which transfers tokens correctly', async () => {
      const id = await exchange.getLastOfferId();
      const preMln = await mlnToken.balanceOf(vault.address);
      const preEth = await ethToken.balanceOf(vault.address);
      await vault.takeOrder(id, sellAmt, { from: manager });
      const postMln = await mlnToken.balanceOf(vault.address);
      const postEth = await ethToken.balanceOf(vault.address);
      assert.equal(postMln.toNumber() - preMln.toNumber(), sellAmt);
      assert.equal(preEth.toNumber() - postEth.toNumber(), buyAmt);
    });
  });
});
