const async = require('async');
const assert = require('assert');
const BigNumber = require('bignumber.js');
const constants = require('../utils/constants.js');
const functions = require('../utils/functions.js');

const AssetProtocol = artifacts.require('AssetProtocol.sol');
const EtherToken = artifacts.require('EtherToken.sol');
const MelonToken = artifacts.require('MelonToken.sol');
const PriceFeed = artifacts.require('PriceFeed.sol');
const Exchange = artifacts.require('Exchange.sol');
const Universe = artifacts.require('Universe.sol');
const Subscribe = artifacts.require('./Subscribe.sol');
const Redeem = artifacts.require('./Redeem.sol');
const RiskMgmt = artifacts.require('RiskMgmt.sol');
const ManagementFee = artifacts.require('ManagementFee.sol');
const PerformanceFee = artifacts.require('PerformanceFee.sol');
const Core = artifacts.require('Core.sol');

contract('Net Asset Value', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const PORTFOLIO_NAME = 'Melon Portfolio';
  const NOT_OWNER = accounts[1];
  const NUM_OFFERS = 1;
  const ALLOWANCE_AMOUNT = constants.PREMINED_AMOUNT / 10;

  // Kraken example for: https://api.kraken.com/0/public/Ticker?pair=MLNETH,ETHXBT,REPETH,ETHEUR
  let data = {
    'error':[],
    'result': {
      'XETHXXBT':{'a':['0.048000','871','871.000'],'b':['0.047805','38','38.000'],'c':['0.048000','25.00000000'],'v':['114473.71344905','228539.93878035'],'p':['0.044567','0.031312'],'t':[4425,8621],'l':['0.041600','0.038900'],'h':['0.048700','0.048700'],'o':'0.041897'},
      'XETHZEUR':{'a':['43.65000','167','167.000'],'b':['43.51021','1','1.000'],'c':['43.60000','10.00000000'],'v':['138408.66847600','245710.71986448'],'p':['41.96267','40.67496'],'t':[6247,11473],'l':['39.27000','37.42000'],'h':['44.96998','44.96998'],'o':'39.98679'},
      'XMLNXETH':{'a':['0.59890000','36','36.000'],'b':['0.56119000','205','205.000'],'c':['0.56000000','0.00022300'],'v':['1621.65161884','2098.74750661'],'p':['0.60344695','0.61624131'],'t':[175,264],'l':['0.56000000','0.56000000'],'h':['0.65929000','0.67800000'],'o':'0.65884000'},
      'XREPXETH':{'a':['0.202450','70','70.000'],'b':['0.200200','50','50.000'],'c':['0.199840','1.81418400'],'v':['2898.19114399','5080.16762561'],'p':['0.197919','0.208634'],'t':[219,382],'l':['0.182120','0.182120'],'h':['0.215080','0.239990'],'o':'0.214740'}
    }
  };

  // Atomize Prices realtive to Ether
  let pricesRelEther = functions.krakenPricesRelEther(data);

  let assets = [];
  let priceFeedTestCases = [];

  // Atomize Prices realtive to Asset
  let pricesRelAsset = functions.krakenPricesRelAsset(data);

  // Test globals
  let coreContract;
  let etherTokenContract;
  let melonTokenContract;
  let priceFeedContract;
  let exchangeContract;
  let universeContract;
  let subscribeContract;
  let redeemContract;
  let riskmgmtContract;
  let managementFeeContract;
  let performanceFeeContract;
  let exchangeTestCases;
  let riskmgmtTestCases;


  describe('PREPARATIONS', () => {
    before('Check accounts, deploy modules, set testcase', () => {
      EtherToken.deployed().then((deployed) => { etherTokenContract = deployed; });
      MelonToken.deployed().then((deployed) => { melonTokenContract = deployed; });
      PriceFeed.deployed().then((deployed) => { priceFeedContract = deployed; });
      Exchange.deployed().then((deployed) => { exchangeContract = deployed; });
      Universe.deployed().then((deployed) => { universeContract = deployed; });
      Subscribe.deployed().then((deployed) => { subscribeContract = deployed; });
      Redeem.deployed().then((deployed) => { redeemContract = deployed; });
      RiskMgmt.deployed().then((deployed) => { riskmgmtContract = deployed; });
      ManagementFee.deployed().then((deployed) => { managementFeeContract = deployed; });
      PerformanceFee.deployed().then((deployed) => { performanceFeeContract = deployed; });
    });

    it('Define Price Feed testcase', () => {
      universeContract.numAssignedAssets()
      .then((numAssets) => {
        for (let i = 0; i < numAssets; i += 1) {
          universeContract.assetAt(i)
          .then((assetAddr) => {
            assets.push(assetAddr);
            AssetProtocol.at(assetAddr).getSymbol().then((symbol) => {
              console.log(` ${symbol}: ${assetAddr}`);
              priceFeedTestCases.push({ address: assetAddr, price: pricesRelAsset[i], symbol });
            })
          })
        }
      });
    });

    it('Deploy smart contract', (done) => {
      Core.new(
        PORTFOLIO_NAME,
        OWNER,
        universeContract.address,
        subscribeContract.address,
        redeemContract.address,
        riskmgmtContract.address,
        managementFeeContract.address,
        performanceFeeContract.address,
        { from: OWNER })
          .then((result) => {
            coreContract = result;
            return coreContract.totalSupply();
          })
          .then((result) => {
            assert.equal(result.toNumber(), 0);
            done();
          });
    });

    it('Set multiple price', (done) => {
      priceFeedContract.updatePrice(assets, pricesRelAsset, { from: OWNER })
      .then((result) => {
        // Check Logs
        assert.notEqual(result.logs.length, 0);
        for (let i = 0; i < result.logs.length; i += 1) {
          // console.log(result);
          assert.equal(result.logs[i].event, 'PriceUpdated');
          assert.equal(result.logs[i].args.ofAsset, assets[i]);
          // TODO test against actual block.time
          assert.notEqual(result.logs[i].args.atTimestamp.toNumber(), 0);
          assert.equal(result.logs[i].args.ofPrice, pricesRelAsset[i]);
        }
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

  // MAIN TESTING

  describe('MAKE ORDERS VIA PORTFOLIO', () => {
    before('Check initial supply of portfolio', (done) => {
      coreContract.totalSupply()
      .then((result) => {
        assert.strictEqual(result.toNumber(), 0);
        done();
      });
    });

    it('Create an initial order', (done) => {
      const wantedShares = new BigNumber(2e+17);
      const wantedValue = new BigNumber(2e+17);
      const expectedValue = new BigNumber(2e+17);

      etherTokenContract.deposit({ from: NOT_OWNER, value: wantedValue })
      .then(() => etherTokenContract.approve(coreContract.address, wantedValue, { from: NOT_OWNER }))
      .then(() => etherTokenContract.allowance(NOT_OWNER, coreContract.address))
      .then((result) => {
        assert.equal(result.toNumber(), wantedValue.toNumber());
        return coreContract.createShares(wantedShares, { from: NOT_OWNER });
      })
      .then((result) => {
        return coreContract.calcSharePrice({ from: NOT_OWNER });
      })
      .then((result) => {
        // Check Logs
        assert.notEqual(result.logs.length, 0);
        console.log('Portfolio Content');
        for (let i = 0; i < result.logs.length; i += 1) {
          if (result.logs[i].event === 'PortfolioContent') {
            const divider = Math.pow(10, result.logs[i].args.assetDecimals.toNumber());
            console.log(` ${i}: ${result.logs[i].args.assetHoldings / divider} Asset @ ${result.logs[i].args.assetPrice / divider} ETH/Asset`);
          }
          if (result.logs[i].event === 'CalculatedValuesUpdated') {
            console.log(`NAV: ${result.logs[i].args.nav.toNumber() / Math.pow(10, 18)} Delta: ${result.logs[i].args.delta.toNumber() / Math.pow(10, 18)}`);
          }
        }
        return coreContract.sharePrice();
      })
      .then((result) => {
        assert.strictEqual(result.toNumber(), constants.ether.toNumber());
        return etherTokenContract.balanceOf(coreContract.address);
      })
      .then((result) => {
        assert.strictEqual(result.toNumber(), expectedValue.toNumber());
        return coreContract.balanceOf(NOT_OWNER);
      })
      .then((result) => {
        assert.strictEqual(result.toNumber(), expectedValue.toNumber());
        // TODO change values of sellHowMuch and buyHowMuch below
        return coreContract.makeOrder(exchangeContract.address,
          1,
          etherTokenContract.address,
          1,
          melonTokenContract.address,
          { from: OWNER });
      })
      .then((result) => {
        console.log(result);
        done();
      });
    });
  });
});
