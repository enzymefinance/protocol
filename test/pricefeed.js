const BigNumber = require('bignumber.js');
const async = require('async');
const assert = require('assert');
const functions = require('../utils/functions.js');
const constants = require('../utils/constants.js');

// const TOKEN_ADDRESSES = [
//   BitcoinToken.all_networks['3'].address,
//   RepToken.all_networks['3'].address,
//   EuroToken.all_networks['3'].address,
// ];

contract('PriceFeed', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];

  // Kraken example for: https://api.kraken.com/0/public/Ticker?pair=ETHXBT,REPETH,ETHEUR
  const data = {
    'error':[],
    'result': {
      'XETHXXBT': {'a':['0.011558','135','135.000'],'b':['0.011550','376','376.000'],'c':['0.011550','0.47405000'],'v':['100153.86921002','112421.66650936'],'p':['0.011477','0.010527'],'t':[1980,2248],'l':['0.011318','0.011318'],'h':['0.011651','0.011710'],'o':'0.011521'},
      'XETHZEUR': {'a':['9.83249','23','23.000'],'b':['9.79000','72','72.000'],'c':['9.80510','16.54860000'],'v':['33417.76252715','39085.89051588'],'p':['9.72591','9.70190'],'t':[1384,1601],'l':['9.53300','9.51171'],'h':['9.84900','9.84900'],'o':'9.68796'},
      'XREPXETH': {'a':['0.435820','1','1.000'],'b':['0.430570','80','80.000'],'c':['0.435790','1.71736386'],'v':['483.41580154','569.06380459'],'p':['0.428581','0.429142'],'t':[36,48],'l':['0.421730','0.421730'],'h':['0.437000','0.437000'],'o':'0.423270'}
    },
  };
  console.log(data.result.XETHXXBT.c[0])
  const xbt = new BigNumber(data.result.XETHXXBT.c[0]);
  console.log(xbt.e)

  let priceFeedTestCases = [
    {
      address: '0x0000000000000000000000000000000000000000',
      price: functions.createInverseAtomizedPrices(data)[0],
    },
    {
      address: '0x0000000000000000000000000000000000000001',
      price: functions.createInverseAtomizedPrices(data)[1],
    },
    {
      address: '0x0000000000000000000000000000000000000002',
      price: functions.createInverseAtomizedPrices(data)[2],
    },
  ];

  // Test globals
  let priceFeedContract;


  before('Check accounts', (done) => {
    assert.equal(accounts.length, 10);
    done();
  });

  it('Deploy smart contract', (done) => {
    PriceFeed.new().then((result) => {
      priceFeedContract = result;
      return priceFeedContract.fee();
    }).then((result) => {
      assert.equal(result.toNumber(), constants.INITIAL_FEE);
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
    const addresses = [priceFeedTestCases[0].address, priceFeedTestCases[1].address, priceFeedTestCases[2].address];
    const inverseAtomizedPrices = [priceFeedTestCases[0].price, priceFeedTestCases[1].price, priceFeedTestCases[2].price];
    priceFeedContract.setPrice(addresses, inverseAtomizedPrices, { from: OWNER })
        .then(() => priceFeedContract.lastUpdate())
        .then((result) => {
          assert.notEqual(result.toNumber(), 0);
          done();
        });
  });

  it('Get multiple existent prices', (done) => {
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
