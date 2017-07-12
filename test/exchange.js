const assert = require('assert');
const constants = require('../utils/constants.js');
const specs = require('../utils/specs.js');
const functions = require('../utils/functions.js');
const collections = require('../utils/collections.js');

const Exchange = artifacts.require('Exchange.sol');
const EtherToken = artifacts.require('./EtherToken.sol');
const MelonToken = artifacts.require('./MelonToken.sol');

let orders = [];  // Offers collections
accounts = [];
describe.skip('Old tests', () => {
  // Test constants
  const INITIAL_OFFER_ID = 0;
  const OWNER = accounts[0];
  const NUM_OFFERS = 2;
  // Atomize Prices realtive to Asset
  let data = []

  let etherTokenContract;
  let melonTokenContract;
  let exchangeContract;

  before('Init contract instances', () => {
    EtherToken.deployed().then((deployed) => { etherTokenContract = deployed; });
    MelonToken.deployed().then((deployed) => { melonTokenContract = deployed; });
    Exchange.deployed().then((deployed) => { exchangeContract = deployed; });
  });

  it('Check accounts, exchange and premined amount', (done) => {
    exchangeContract.getLastOrderId()
    .then((result) => {
      assert.equal(result.toNumber(), INITIAL_OFFER_ID);
      return MelonToken.deployed().then(deployed => deployed.totalSupply({ from: OWNER }));
    })
    .then((result) => {
      assert.equal(result.toNumber(), constants.PREMINED_MELON_AMOUNT.toNumber());
      return MelonToken.deployed().then(deployed => deployed.balanceOf(OWNER));
    })
    .then((result) => {
      assert.equal(result.toNumber(), constants.PREMINED_MELON_AMOUNT.toNumber());
      done();
    });
  });

  // TODO: can use as integratiion test
  it('Create one side of the orderbook', (done) => {
    functions.takeOneEtherFor(
      pricesRelAsset[1],
      melonTokenContract.address,
      OWNER,
      NUM_OFFERS,
      (err) => {
        if (!err) {
          done();
        } else {
          console.log(err);
        }
      });
  });

  it('Check if orders created', (done) => {
    exchangeContract.getLastOrderId()
    .then((result) => {
      const lastOfferId = result.toNumber();
      assert.equal(lastOfferId, NUM_OFFERS);
      done();
    });
  });

  it('Check orders information', (done) => {
    collections.sync(
      (err, result) => {
        if (!err) {
          orders = result;
          // console.log(orders);
          done();
        } else {
          console.log(err);
        }
      });
  });

  it('Cancel one side of the orderbook', (done) => {
    functions.cancelAllOffersOfOwner(
      OWNER,
      (err, result) => {
        if (!err) {
          done();
        } else {
          console.log(err);
        }
      }
    );
  });

  it('Check orders information', (done) => {
    collections.sync(
      (err, result) => {
        if (!err) {
          orders = result;
          // console.log(orders);
          done();
        } else {
          console.log(err);
        }
      }
    );
  });
})
