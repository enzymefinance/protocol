const EtherToken = artifacts.require('EtherToken');
const PreminedAsset = artifacts.require('PreminedAsset');
const PriceFeed = artifacts.require('DataFeed');
const SimpleMarket = artifacts.require('SimpleMarket');
const SimpleAdapter = artifacts.require('simpleAdapter');
const Participation = artifacts.require('Participation');
const RiskMgmt = artifacts.require('RiskMgmt');
const Sphere = artifacts.require('Sphere');
const Fund = artifacts.require('Fund');
const chai = require('chai');

const assert = chai.assert;

contract('Fund trading', (accounts) => {
  const manager = accounts[0];
  // const liquidityProvider = accounts[0];
  const liquidityProvider = accounts[1];
  let ethToken;
  let mlnToken;
  let fund;
  let simpleMarket;
  let simpleAdapter;

  before('Set up new Fund', async () => {
    ethToken = await EtherToken.new({ from: liquidityProvider });
    const eurToken = await PreminedAsset.new(
      'Euro', 'EUR', 8, 10 ** 18, { from: liquidityProvider });
    mlnToken = await PreminedAsset.new(
      'Melon', 'MLN', 18, 10 ** 18, { from: liquidityProvider });
    const datafeed = await PriceFeed.new(mlnToken.address, 0, 600);
    simpleMarket = await SimpleMarket.new();
    simpleAdapter = await SimpleAdapter.new();
    const sphere = await Sphere.new(datafeed.address, simpleMarket.address);
    const someBytes = '0x86b5eed81db5f691c36cc83eb58cb5205bd2090bf3763a19f0c5bf2f074dd84b';
    await datafeed.register(ethToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    await datafeed.register(eurToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    await datafeed.register(mlnToken.address, '', '', 18, '', someBytes, someBytes, accounts[9], accounts[9]);
    const participation = await Participation.deployed();
    const riskManagement = await RiskMgmt.deployed();
    fund = await Fund.new(
      manager,
      'Melon Portfolio',  // name
      mlnToken.address,   // reference asset
      0,                  // mgmt reward
      0,                  // perf reward
      mlnToken.address,
      participation.address,
      riskManagement.address,
      sphere.address,
      { from: manager },
    );
    await mlnToken.transfer(fund.address, 1000000, { from: liquidityProvider }); // initialize balances
    await ethToken.transfer(fund.address, 1000000, { from: liquidityProvider });
    await datafeed.update(
      [ethToken.address, eurToken.address, mlnToken.address],
      [1000000000000000000, 5091131249363608, 226244343891402714], // mock data
    );
  });
  describe('#makeOrder', () => {
    const sellAmt = 10000;
    const buyAmt = 2000;
    it('creating order approves token spending for fund', async () => {
      const preMln = await mlnToken.balanceOf(fund.address);
      await fund.makeOrder(mlnToken.address, ethToken.address, sellAmt, buyAmt, { from: manager });
      const postMln = await mlnToken.balanceOf(fund.address);
      assert.equal(preMln - sellAmt, postMln);
    });
    it('makes an order with expected parameters', async () => {
      const id = await fund.getLastOrderId();
      const order = await fund.orders(id);
      const exchangeOrderId = await simpleAdapter.getLastOrderId(simpleMarket.address);
      assert.equal(order[0].toNumber(), exchangeOrderId.toNumber());
      assert.equal(order[3], mlnToken.address);
      assert.equal(order[4], ethToken.address);
      assert.equal(order[5].toNumber(), sellAmt);
      assert.equal(order[6].toNumber(), buyAmt);
      // assert.equal(order[7].toNumber(), 0); // TODO fix: Timestamp
      assert.equal(order[8].toNumber(), 0);
    });
  });
  describe('#takeOrder', () => {
    const sellAmt = 20000;  // sell/buy from maker's perspective
    const buyAmt = 4000;
    before('make an order to take', async () => {
      await mlnToken.approve(simpleMarket.address, sellAmt, { from: liquidityProvider }); // make an order to take
      await simpleMarket.make(
        mlnToken.address, ethToken.address, sellAmt, buyAmt, { from: liquidityProvider },
      );
    });
    it('takes 100% of an order, which transfers tokens correctly', async () => {
      const id = await simpleAdapter.getLastOrderId(simpleMarket.address);
      const preMln = await mlnToken.balanceOf(fund.address);
      const preEth = await ethToken.balanceOf(fund.address);
      await fund.takeOrder(id, sellAmt, { from: manager });
      const postMln = await mlnToken.balanceOf(fund.address);
      const postEth = await ethToken.balanceOf(fund.address);
      assert.equal(postMln.toNumber() - preMln.toNumber(), sellAmt);
      assert.equal(preEth.toNumber() - postEth.toNumber(), buyAmt);
    });
  });
});
