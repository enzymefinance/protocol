const SimpleMarket = artifacts.require('SimpleMarket');
const ExchangeAdapter = artifacts.require('ExchangeAdapter');
const EtherToken = artifacts.require('EtherToken');
const PreminedAsset = artifacts.require('PreminedAsset');
const chai = require('chai');

const assert = chai.assert;

contract('SimpleMarket', (accounts) => {
  let ethToken;
  let mlnToken;
  let simpleMarket;
  let market;

  before('Deploy contract instances', async () => {
    ethToken = await EtherToken.new();
    mlnToken = await PreminedAsset.new('Melon token', 'MLN', 18, 10 ** 28);
    simpleMarket = await SimpleMarket.new();
    market = await ExchangeAdapter.new(simpleMarket.address);
  });

  it('empty market has zero nexOrderId', async () => {
    const firstId = await market.getLastOrderId();
    assert.equal(firstId.toNumber(), 0);
  });

  describe('#make()', () => {
    it('calls without error', async () => {
      const amt = 1000;
      await mlnToken.approve(market.address, amt, { from: accounts[0] });
      await market.makeOrder(
        mlnToken.address, ethToken.address, amt, amt, { from: accounts[0] },
      );
    });

    it('activates order', async () => {
      const oid = await market.getLastOrderId();
      const active = await market.isActive(oid);
      assert(active);
    });

    it('sets owner of order', async () => {
      const oid = await market.getLastOrderId();
      const owner = await market.getOwner(oid);
      assert.equal(market.address, owner);
    });
  });

  describe('#cancel()', () => {
    it('calls without error', async () => {
      const oid = await market.getLastOrderId();
      await market.cancelOrder(oid);
    });

    it('deactivates order', async () => {
      const oid = await market.getLastOrderId();
      const active = await market.isActive(oid);
      assert.isFalse(active);
    });
  });

  describe('#take()', () => {
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
      describe(`take ${test.cond} order value`, () => {
        const pre = { taker: {}, maker: {} };
        before('Setup order', async () => {
          pre.taker.mln = await mlnToken.balanceOf(taker);
          pre.taker.eth = await ethToken.balanceOf(taker);
          pre.buyr.mln = await mlnToken.balanceOf(maker);
          pre.maker.eth = await ethToken.balanceOf(maker);
          await mlnToken.approve(market.address, test.makeAmt, { from: maker });
          await market.takeOrder(
            mlnToken.address, ethToken.address, test.makeAmt, test.makeAmt, { from: maker },
          );
        });

        it('calls without error, where appropriate', async () => {
          const oid = await market.getLastOrderId();
          assert(market.isActive(oid));
          await ethToken.approve(market.address, test.takeAmt, { from: taker });
          if (test.cond === '>') {
            try {
              await market.take(oid, test.takeAmt, { from: taker })
              assert(false, 'No error thrown');
            } catch (e) {
              const e1 = e.message.indexOf('invalid opcode') !== -1;
              const e2 = e.message.indexOf('invalid JUMP') !== -1;
              if (!e1 && !e2) assert(false, 'Unexpected error message');
              else assert(true);
            }
          } else {
            await market.take(oid, test.takeAmt, { from: taker })
          }
        });

        it('deactivates order, if filled', async () => {
          const oid = await market.getLastOrderId();
          const active = await market.isActive(oid);
          if (test.cond === '==') {
            assert.isFalse(active);
          } else {
            assert.isTrue(active);
            await market.cancelOrder(oid, { from: maker }); // cancel to return mln
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
