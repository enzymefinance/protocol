const SimpleMarket = artifacts.require('SimpleMarket');
const ExchangeAdapter = artifacts.require('simpleAdapter');
const EtherToken = artifacts.require('EtherToken');
const PreminedAsset = artifacts.require('PreminedAsset');
const chai = require('chai');

const assert = chai.assert;

contract('SimpleMarket', (accounts) => {
  let ethToken;
  let mlnToken;
  let simpleMarket;
  let simpleAdapter;

  before('Deploy contract instances', async () => {
    ethToken = await EtherToken.new();
    mlnToken = await PreminedAsset.new('Melon token', 'MLN', 18, 10 ** 28);
    simpleMarket = await SimpleMarket.new();
    simpleAdapter = await ExchangeAdapter.new();
  });

  it('empty simpleAdapter has zero nextOrderId', async () => {
    const firstId = await simpleAdapter.getLastOrderId(simpleMarket.address);
    assert.equal(firstId.toNumber(), 0);
  });

  describe.skip('#make()', () => {
    it('calls without error', async () => {
      const amt = 1000;
      await mlnToken.transfer(simpleAdapter.address, amt, { from: accounts[0] });
      await simpleAdapter.makeOrder(
        simpleMarket.address, mlnToken.address, ethToken.address, amt, amt, { from: accounts[0] },
      );
    });

    it('activates order', async () => {
      const oid = await simpleAdapter.getLastOrderId(simpleMarket.address);
      const active = await simpleAdapter.isActive(simpleMarket.address, oid);
      assert(active);
    });

    it('sets owner of order', async () => {
      const oid = await simpleAdapter.getLastOrderId(simpleMarket.address);
      const owner = await simpleAdapter.getOwner(simpleMarket.address, oid);
      assert.equal(simpleAdapter.address, owner);
    });
  });

  describe.skip('#cancel()', () => {
    it('calls without error', async () => {
      const oid = await simpleAdapter.getLastOrderId(simpleMarket.address);
      await simpleAdapter.cancelOrder(simpleMarket.address, oid);
    });

    it('deactivates order', async () => {
      const oid = await simpleAdapter.getLastOrderId(simpleMarket.address);
      const active = await simpleAdapter.isActive(simpleMarket.address, oid);
      assert.isFalse(active);
    });
  });

  describe.skip('#takeOrder()', () => {
    let maker;
    let taker;
    before(async () => {
      maker = accounts[0]; // simpleAdapter owner
      taker = accounts[0]; // simpleAdapter owner
      // simpleAdapter acts as proxy for maker, taker
      await mlnToken.transfer(simpleAdapter.address, 3000, { from: accounts[0] }); // give mlnT
      await ethToken.transfer(simpleAdapter.address, 3000, { from: accounts[0] }); // give ethT
    });

    const tests = [
      { takeAmt: 500, makeAmt: 500, cond: '==', change: 500 },
      { takeAmt: 500, makeAmt: 1000, cond: '<', change: 500 },
      { takeAmt: 1000, makeAmt: 500, cond: '>', change: 0 },
    ];

    tests.forEach((test) => {
      describe(`take ${test.cond} order value`, () => {
        const pre = { taker: {}, maker: {} };
        before('Setup order', async () => {
          pre.taker.mln = await mlnToken.balanceOf(taker);
          pre.taker.eth = await ethToken.balanceOf(taker);
          pre.maker.mln = await mlnToken.balanceOf(maker);
          pre.maker.eth = await ethToken.balanceOf(maker);
          await simpleAdapter.makeOrder(
            simpleMarket.address, mlnToken.address, ethToken.address, test.makeAmt, test.makeAmt, { from: maker },
          );
        });

        it('calls without error, where appropriate', async () => {
          const oid = await simpleAdapter.getLastOrderId();
          assert(simpleAdapter.isActive(oid));
          if (test.cond === '>') {
            try {
              await simpleAdapter.takeOrder(simpleMarket.address, oid, test.takeAmt, { from: taker })
              assert(false, 'No error thrown');
            } catch (e) {
              const e1 = e.message.indexOf('invalid opcode') !== -1;
              const e2 = e.message.indexOf('invalid JUMP') !== -1;
              if (!e1 && !e2) assert(false, 'Unexpected error message');
              else assert(true);
            }
          } else {
            await simpleAdapter.takeOrder(simpleMarket.address, oid, test.takeAmt, { from: taker })
          }
        });

        it('deactivates order, if filled', async () => {
          const oid = await simpleAdapter.getLastOrderId();
          const active = await simpleAdapter.isActive(oid);
          if (test.cond === '==') {
            assert.isFalse(active);
          } else {
            assert.isTrue(active);
            await simpleAdapter.cancelOrder(oid, { from: maker }); // cancel to return mln
          }
        });

        it('moves funds correctly', async () => {
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
