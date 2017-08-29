const Calculate = artifacts.require('calculate');
const BigNumber = require('bignumber.js');
const chai = require('chai');
const assert = chai.assert;

contract('Calculate', (accounts) => {
  let calculate;
  before('Get the library', async () => {
    calculate = await Calculate.deployed();
  });
  describe('#priceForNumBaseShares', () => {
    it('price equals input request for empty fund', async () => {
      const input = 10000;
      const price = await calculate.priceForNumBaseShares(input, 20000, 0, 0);
      assert.equal(price.toNumber(), input);
    });
    it('price equals zero for empty request', async () => {
      const price = await calculate.priceForNumBaseShares(0, 200, 200, 200);
      assert.equal(price.toNumber(), 0);
    });
    it('price equals requested share proportion times NAV', async () => {
      let price = await calculate.priceForNumBaseShares(100, 100, 500, 200);
      assert.equal(price.toNumber(), 250);
      price = await calculate.priceForNumBaseShares(100, 20, 500, 200);
      assert.equal(price.toNumber(), 250);  // change baseunits
      price = await calculate.priceForNumBaseShares(100, 20, 100, 200);
      assert.equal(price.toNumber(), 50);   // nav < totalSupply
      price = await calculate.priceForNumBaseShares(300, 20, 100, 200);
      assert.equal(price.toNumber(), 150);   // requested > totalSupply
    });
  });
  describe('#grossAssetValue', () => {
    it('returns sum of asset values', async () => {
      const gav = await calculate.grossAssetValue(
        [0, 100, 200, 500, 1000], // holdings
        [2, 0, 10, 100, 10],      // prices
        [3, 2, 18, 10, 0],        // decimals
      );
      assert.equal(gav.toNumber(),
        Math.round(
          (0 * 2 / (10 ** 3))
          + (100 * 0 / (10 ** 2))
          + (200 * 10 / (10 ** 18))
          + (500 * 100 / (10 ** 10))
          + (1000 * 10 / (10 ** 0))
        )
      )
    });
  });
  describe('#netAssetValue', () => {
    it('gets correct value for non-empty NAV', async () => {
      let nav = await calculate.netAssetValue(3000, 200);
      assert.equal(nav.toNumber(), 2800);
    });
    it('errors when rewards larger than assets available', () => {
      assert.throws(() => calculate.netAssetValue(2000, 3000))
    });
  });
  describe('#managementReward', () => {
    it('returns zero when no time has elapsed', async () => {
      const rwd = await calculate.managementReward(2, 0, 1000, 100);
      assert.equal(rwd.toNumber(), 0);
    });
    it('returns correct reward when some time passed', async () => {
      const rwd = await calculate.managementReward(2, 30, 1000, 100);
      assert.equal(rwd.toNumber(), 600);
    });
  });
  describe('#performanceReward', () => {
    it('returns zero when no difference in share price', async () => {
      const rwd = await calculate.performanceReward(2, 0, 1000, 100);
      assert.equal(rwd.toNumber(), 0);
    });
    it('returns zero when share price has decreased', async () => {
      const rwd = await calculate.performanceReward(2, -200, 1000, 100);
      assert.equal(rwd.toNumber(), 0);
    });
    it('returns correct number when share price has increased', async () => {
      const rwd = await calculate.performanceReward(2, 200, 1000, 100);
      assert.equal(rwd.toNumber(), 4000);
    });
  });
  describe('#rewards', () => {
    it('calculates correct rewards', async () => {
      [mgmt, perf, unclaimed] = await calculate.rewards(
        200000, 210000, 1, 10000000, 40000, 2000, 100, 10, 100000000,
      );
      assert.equal(mgmt.toNumber(), 4);
      assert.equal(perf.toNumber(), 20000);
      assert.equal(unclaimed.toNumber(), mgmt.toNumber() + perf.toNumber());
    });
  });
});
