const async = require('async');
const assert = require('assert');
const functions = require('../utils/functions.js');
const constants = require('../utils/constants.js');

const EtherToken = artifacts.require('./EtherToken.sol');
const MelonToken = artifacts.require('./MelonToken.sol');
const PriceFeed = artifacts.require('PriceFeed.sol');
const Universe = artifacts.require('Universe.sol');

contract('PriceFeed', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const BACKUP_OWNER = accounts[1];
  const NOT_OWNER = accounts[2];

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

  // Atomize Prices realtive to Ether
  const pricesRelEther = functions.krakenPricesRelEther(data);

  let assets = [];
  let priceFeedTestCases = [];


  // Test globals
  let etherTokenContract;
  let melonTokenContract;
  let priceFeedContract;
  let universeContract;


  before('Init contract instances', () => {
    EtherToken.deployed().then((deployed) => { etherTokenContract = deployed; });
    MelonToken.deployed().then((deployed) => { melonTokenContract = deployed; });
    PriceFeed.deployed().then((deployed) => { priceFeedContract = deployed; });
    Universe.deployed().then((deployed) => { universeContract = deployed; });
  });

  it('Define Price Feed testcase', () => {
    universeContract.numAssignedAssets()
    .then((numAssets) => {
      for (let i = 0; i < numAssets; i += 1) {
        universeContract.assetAt(i)
        .then((assetAddr) => {
          assets.push(assetAddr);
          priceFeedTestCases.push({ address: assetAddr, price: pricesRelEther[i] });
        })
      }
    });
  });

  it('Deploy smart contract', (done) => {
    priceFeedContract.getFrequency()
    .then((result) => {
      assert.equal(result.toNumber(), 120);
      return priceFeedContract.backupOwner();
    }).then((result) => {
      assert.equal(result, BACKUP_OWNER);
      done();
    });
  });

  it('Get not existent price', (done) => {
    priceFeedContract.getPrice('', { from: NOT_OWNER })
    .then(() => console.log('If this gets executed then previous contract did not throw error.'))
    .catch(() => {
      done();
    });
  });

  it('Set multiple price', (done) => {
    priceFeedContract.updatePrice(assets, pricesRelEther, { from: OWNER })
    .then((result) => {
      // Check Logs
      assert.notEqual(result.logs.length, 0);
      for (let i = 0; i < result.logs.length; i += 1) {
        // console.log(result);
        assert.equal(result.logs[i].event, 'PriceUpdated');
        assert.equal(result.logs[i].args.ofAsset, assets[i]);
        // TODO test against actual block.time
        assert.notEqual(result.logs[i].args.atTimestamp.toNumber(), 0);
        assert.equal(result.logs[i].args.ofPrice, pricesRelEther[i]);
      }
      done();
    });
  });

  it('Get multiple existent prices relative to Ether', (done) => {
    async.mapSeries(
      priceFeedTestCases,
      (testCase, callbackMap) => {
        priceFeedContract.getPrice(testCase.address, { from: NOT_OWNER })
        .then((result) => {
          assert.equal(result.toNumber(), testCase.price);
          callbackMap(null, testCase);
        });
      },
    (err, results) => {
      priceFeedTestCases = results;
      done();
    });
  });
});
