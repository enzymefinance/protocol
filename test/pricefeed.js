const async = require('async');
const assert = require('assert');
const functions = require('../utils/functions.js');
const constants = require('../utils/constants.js');

var PriceFeed = artifacts.require("PriceFeed.sol");

contract('PriceFeed', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const assets = [
    '0x632a40acd4975295495f45190e612ef15c84ae91',
    '0xcb8d1b21f0ceb07959e47eb8152f25332939c0dc',
    '0x9265c634b43bafc5305fed65c157ee1d7b6b8b50',
    '0x6d7e5ec3d87cbe5d6efa611f86ea27da53c9a360',
  ];

  // Kraken example for: https://api.kraken.com/0/public/Ticker?pair=ETHXBT,REPETH,ETHEUR
  const data = {
    'error':[],
    'result': {
      'XETHXXBT': {'a':['0.011558','135','135.000'],'b':['0.011550','376','376.000'],'c':['0.011550','0.47405000'],'v':['100153.86921002','112421.66650936'],'p':['0.011477','0.010527'],'t':[1980,2248],'l':['0.011318','0.011318'],'h':['0.011651','0.011710'],'o':'0.011521'},
      'XETHZEUR': {'a':['9.83249','23','23.000'],'b':['9.79000','72','72.000'],'c':['9.80510','16.54860000'],'v':['33417.76252715','39085.89051588'],'p':['9.72591','9.70190'],'t':[1384,1601],'l':['9.53300','9.51171'],'h':['9.84900','9.84900'],'o':'9.68796'},
      'XREPXETH': {'a':['0.435820','1','1.000'],'b':['0.430570','80','80.000'],'c':['0.435790','1.71736386'],'v':['483.41580154','569.06380459'],'p':['0.428581','0.429142'],'t':[36,48],'l':['0.421730','0.421730'],'h':['0.437000','0.437000'],'o':'0.423270'},
    }
  };

  // Prices Relative to Ether
  const ett_eth = 1.0; // By definition
  const xbt_eth = data.result.XETHXXBT.c[0]; // Price already relavtive to ether
  const rep_eth = functions.invertAssetPairPrice(data.result.XREPXETH.c[0]);
  const eur_eth = data.result.XETHZEUR.c[0]; // Price already relavtive to ether

  // Atomize Prices realtive to Ether
  const pricesRelEther = [
    functions.atomizeAssetPrice(ett_eth, constants.ETHERTOKEN_DECIMALS),
    functions.atomizeAssetPrice(xbt_eth, constants.BITCOINTOKEN_DECIMALS),
    functions.atomizeAssetPrice(rep_eth, constants.REPTOKEN_DECIMALS),
    functions.atomizeAssetPrice(eur_eth, constants.EUROTOKEN_DECIMALS),
  ];

  // Testcases
  let priceFeedTestCases = [];
  for (let i = 0; i < assets.length; i += 1) {
    priceFeedTestCases.push({ address: assets[i], price: pricesRelEther[i] });
  }

  // Test globals
  let priceFeedContract;


  before('Check accounts set asset addresses', (done) => {
    assert.equal(accounts.length, 10);
    done();
  });

  it('Deploy smart contract', (done) => {
    PriceFeed.new().then((result) => {
      priceFeedContract = result;
      return priceFeedContract.getFrequency();
    }).then((result) => {
      assert.equal(result.toNumber(), 120);
    }).then(() => {
      done();
    });
  });

  it('Get not existent price', (done) => {
    priceFeedContract.getPrice('', { from: NOT_OWNER }).then((result) => {
      assert.equal(result.toNumber(), 0);
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
        assert.equal(result.logs[i].args.ofPrice, pricesRelEther[i]);
        assert.equal(result.logs[i].args.ofUpdateCounter.toNumber(), i + 1);
      }
      return priceFeedContract.getUpdateCounter();
    })
    .then((result) => {
      assert.equal(result.toNumber(), assets.length);
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
