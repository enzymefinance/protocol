// const Exchange = artifacts.require('Exchange');
// const EtherToken = artifacts.require('EtherToken');
// const Asset = artifacts.require('Asset');
//const tokens = require('../migrations/config/token_info');
const chai = require('chai');

const assert = chai.assert;

contract('Exchange', (accounts) => {
  let ethToken;
  let mlnToken;
  let exchange;

  before('Deploy contract instances', async () => {
    ethToken = await EtherToken.new();
    mlnToken = await Asset.new();
    // exchange = await Exchange.deployed();
  });

  it.skip('Empty exchange has zero orderId', async () => {
    const firstId = await exchange.getLastOrderId();
    assert.equal(firstId.toNumber(), 0);
  });

  describe.skip('#make()', () => {
    it('Calls without error', async () => {
      const amt = 1000;
      await mlnToken.approve(exchange.address, amt, { from: accounts[0] });
      await exchange.make(
        amt, mlnToken.address, amt, ethToken.address, { from: accounts[0] },
      );
    });

    it('Activates order', async () => {
      const oId = await exchange.getLastOrderId();
      const active = await exchange.isActive(oId);
      assert(active);
    });

    it('Sets owner of order', async () => {
      const oId = await exchange.getLastOrderId();
      const owner = await exchange.getOwner(oId);
      assert.equal(accounts[0], owner);
    });
  });

  describe.skip('#cancel()', () => {
    it('Calls without error', async () => {
      const oId = await exchange.getLastOrderId();
      await exchange.cancel(oId);
    });

    it('Deactivates order', async () => {
      const oId = await exchange.getLastOrderId();
      const active = await exchange.isActive(oId);
      assert.isFalse(active);
    });
  });

  describe.skip('#take()', () => {
    const maker = accounts[1];
    const taker = accounts[2];
    before(async () => {
      await mlnToken.transfer(maker, 3000, { from: accounts[0] }); // give mlnT
      await ethToken.transfer(taker, 3000, { from: accounts[0] }); // give ethT
    });

    const tests = [
      { takeAmt: 500, makeAmt: 500, cond: '==', change: 500 },
      { takeAmt: 500, makeAmt: 1000, cond: '<', change: 500 },
      { takeAmt: 1000, makeAmt: 500, cond: '>', change: 0 },
    ];

    tests.forEach((test) => {
      describe(`Take ${test.cond} order value`, () => {
        const pre = { taker: {}, maker: {} };
        before(async () => {
          pre.taker.mln = await mlnToken.balanceOf(taker);
          pre.taker.eth = await ethToken.balanceOf(taker);
          pre.maker.mln = await mlnToken.balanceOf(maker);
          pre.maker.eth = await ethToken.balanceOf(maker);
          await mlnToken.approve(exchange.address, test.makeAmt, { from: maker });
          await exchange.make(
            test.makeAmt, mlnToken.address, test.makeAmt, ethToken.address, { from: maker },
          );
        });

        it('Calls without error', async () => {
          const oId = await exchange.getLastOrderId();
          await ethToken.approve(exchange.address, test.takeAmt, { from: taker });
          await exchange.take(oId, test.takeAmt, { from: taker });
        });

        it('Deactivates order, if filled', async () => {
          const oId = await exchange.getLastOrderId();
          const active = await exchange.isActive(oId);
          if (test.cond === '==') {
            assert.isFalse(active);
          } else {
            assert.isTrue(active);
            await exchange.cancel(oId, { from: maker }); // cancel to return mln
          }
        });

        it('Moves funds correctly', async () => {
          const post = { taker: {}, maker: {} };
          post.taker.mln = await mlnToken.balanceOf(taker);
          post.taker.eth = await ethToken.balanceOf(taker);
          post.maker.mln = await mlnToken.balanceOf(maker);
          post.maker.eth = await ethToken.balanceOf(maker);
          assert.equal(post.taker.mln.toNumber(), pre.taker.mln.toNumber() + test.change);
          assert.equal(post.taker.eth.toNumber(), pre.taker.eth.toNumber() - test.change);
          assert.equal(post.maker.mln.toNumber(), pre.maker.mln.toNumber() - test.change);
          assert.equal(post.maker.eth.toNumber(), pre.maker.eth.toNumber() + test.change);
        });
      });
    });
  });
});
