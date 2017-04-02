const assert = require('assert');
const constants = require('../utils/constants.js');
const specs = require('../utils/specs.js');
const functions = require('../utils/functions.js');
const collections = require('../utils/collections.js');

const Exchange = artifacts.require('Exchange.sol');
const EtherToken = artifacts.require('./EtherToken.sol');
const MelonToken = artifacts.require('./MelonToken.sol');

let orders = [];  // Offers collections

contract('Exchange', (accounts) => {
  // Test constants
  const INITIAL_OFFER_ID = 0;
  const OWNER = accounts[0];
  const NUM_OFFERS = 2;
  // Kraken example for: https://api.kraken.com/0/public/Ticker?pair=MLNETH,ETHXBT,REPETH,ETHEUR
  const data = {
    'error':[],
    'result': {
      'XETHXXBT':{'a':['0.048000','871','871.000'],'b':['0.047805','38','38.000'],'c':['0.048000','25.00000000'],'v':['114473.71344905','228539.93878035'],'p':['0.044567','0.031312'],'t':[4425,8621],'l':['0.041600','0.038900'],'h':['0.048700','0.048700'],'o':'0.041897'},
      'XETHZEUR':{'a':['43.65000','167','167.000'],'b':['43.51021','1','1.000'],'c':['43.60000','10.00000000'],'v':['138408.66847600','245710.71986448'],'p':['41.96267','40.67496'],'t':[6247,11473],'l':['39.27000','37.42000'],'h':['44.96998','44.96998'],'o':'39.98679'},
      'XMLNXETH':{'a':['0.59890000','36','36.000'],'b':['0.56119000','205','205.000'],'c':['0.56000000','0.00022300'],'v':['1621.65161884','2098.74750661'],'p':['0.60344695','0.61624131'],'t':[175,264],'l':['0.56000000','0.56000000'],'h':['0.65929000','0.67800000'],'o':'0.65884000'},
      'XREPXETH':{'a':['0.202450','70','70.000'],'b':['0.200200','50','50.000'],'c':['0.199840','1.81418400'],'v':['2898.19114399','5080.16762561'],'p':['0.197919','0.208634'],'t':[219,382],'l':['0.182120','0.182120'],'h':['0.215080','0.239990'],'o':'0.214740'}
    }
  };

  // Atomize Prices realtive to Asset
  const pricesRelAsset = functions.krakenPricesRelAsset(data);

  let etherTokenContract;
  let melonTokenContract;
  let exchangeContract;

  before('Init contract instances', () => {
    EtherToken.deployed().then((deployed) => { etherTokenContract = deployed; });
    MelonToken.deployed().then((deployed) => { melonTokenContract = deployed; });
    Exchange.deployed().then((deployed) => { exchangeContract = deployed; });
  });

  it('Check accounts, exchange and premined amount', (done) => {
    exchangeContract.getLastOfferId()
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
    exchangeContract.getLastOfferId()
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
});
