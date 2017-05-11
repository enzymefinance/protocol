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
  const PORTFOLIO_SYMBOL = 'MLN-P';
  const PORTFOLIO_DECIMALS = 18;
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
        OWNER,
        PORTFOLIO_NAME,
        PORTFOLIO_SYMBOL,
        PORTFOLIO_DECIMALS,
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

    it('Set up test cases', (done) => {
      exchangeTestCases = [];
      for (let i = 0; i < NUM_OFFERS; i += 1) {
        exchangeTestCases.push(
          {
            sell_how_much: Math.floor(pricesRelEther[1] * (1 - (i * 0.1))),
            sell_which_token: melonTokenContract.address,
            buy_how_much: 1 * constants.ether,
            buy_which_token: etherTokenContract.address,
            id: i + 1,
            owner: OWNER,
            active: true,
          }
        );
      }
      done();
    });

    it('OWNER approves exchange to hold funds of melonTokenContract', (done) => {
      melonTokenContract.approve(exchangeContract.address, ALLOWANCE_AMOUNT, { from: OWNER })
      .then(() => melonTokenContract.allowance(OWNER, exchangeContract.address))
      .then((result) => {
        assert.equal(result, ALLOWANCE_AMOUNT);
        done();
      });
    });

    it('Create one side of the orderbook', (done) => {
      // const melonTokenAddress = specs.tokens[specs.network]['BTC-T'];
      functions.takeOneEtherFor(
        pricesRelEther[1],
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
      async.mapSeries(
        exchangeTestCases,
        (testCase, callbackMap) => {
          exchangeContract.orders(testCase.id)
          .then(() => {
            callbackMap(null, testCase);
          });
        },
        (err, results) => {
          exchangeTestCases = results;
          done();
        }
      );
    });
  });

  // MAIN TESTING

  describe('INVESTING IN PORTFOLIO', () => {
    before('Check initial supply of portfolio', (done) => {
      coreContract.totalSupply()
      .then((result) => {
        assert.strictEqual(result.toNumber(), 0);
        done();
      });
    });

    it('Wanted Shares == Offered Value', (done) => {
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
        return coreContract.calcSharePrice();
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
        done();
      });
    });

    it('Wanted Shares < Offered Value (overpaid)', (done) => {
      const wantedShares = new BigNumber(1e+17);
      const wantedValue = new BigNumber(2e+17);
      const expectedValue = new BigNumber(3e+17); // 0.2 from previous test

      etherTokenContract.deposit({ from: NOT_OWNER, value: wantedValue })
      .then(() => etherTokenContract.approve(coreContract.address, wantedValue, { from: NOT_OWNER }))
      .then(() => etherTokenContract.allowance(NOT_OWNER, coreContract.address))
      .then((result) => {
        assert.equal(result.toNumber(), wantedValue.toNumber());
        return coreContract.createShares(wantedShares, { from: NOT_OWNER });
      })
      .then((result) => {
        return coreContract.calcSharePrice();
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
        done();
      });
    });

    it('Wanted Shares > Offered Value (underpaid)', (done) => {
      const wantedShares = new BigNumber(2e+17);
      const wantedValue = new BigNumber(1e+17);
      const expectedValue = new BigNumber(3e+17); // 0.3 from previous test

      etherTokenContract.deposit({ from: NOT_OWNER, value: wantedValue })
      .then(() => etherTokenContract.approve(coreContract.address, wantedValue, { from: NOT_OWNER }))
      .then(() => etherTokenContract.allowance(NOT_OWNER, coreContract.address))
      .then((result) => {
        assert.equal(result.toNumber(), wantedValue.toNumber());
        return coreContract.createShares(wantedShares, { from: NOT_OWNER });
      })
      .catch(() => {
        // Gets executed if contract throws exception
        coreContract.calcSharePrice().then((result) => {
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
          done();
        })
      });
    });
  });

  describe('MANAGING POSITIONS OF A PORTFOLIO', () => {
    it('Manage Postion', (done) => {
      const offerId = 1;
      let buyHowMuch;

      exchangeContract.getOrder(offerId).then((result) => {
        buyHowMuch = result[0].toNumber();
        const quantity = Math.min(buyHowMuch)
        return coreContract.takeOrder(exchangeContract.address, offerId, 100000000000000000, { from: OWNER });
      })
      .then((result) => {
        assert.notEqual(result.logs.length, 0);
        return coreContract.calcSharePrice();
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
        done();
      });
    });

    it('Update multiple price', (done) => {
      data = {
        'error':[],
        'result': {
          'XETHXXBT':{'a':['0.047173','72','72.000'],'b':['0.046958','57','57.000'],'c':['0.047188','3.02722723'],'v':['148452.56032886','161336.30511514'],'p':['0.049600','0.028460'],'t':[7341,8030],'l':['0.045908','0.045908'],'h':['0.053630','0.053990'],'o':'0.052219'},
          'XETHZEUR':{'a':['44.79995','22','22.000'],'b':['44.62121','51','51.000'],'c':['44.62120','0.12288403'],'v':['112264.40153999','114942.25454119'],'p':['45.62662','45.24065'],'t':[7531,7826],'l':['44.00000','44.00000'],'h':['47.10043','47.10043'],'o':'45.98999'},
          'XMLNXETH':{'a':['0.64490000','1','1.000'],'b':['0.63679000','1','1.000'],'c':['0.64970000','0.08935121'],'v':['2339.26736089','2365.26736089'],'p':['0.59371313','0.59307630'],'t':[283,286],'l':['0.53245000','0.53245000'],'h':['0.64990000','0.64990000'],'o':'0.53295000'},
          'XREPXETH':{'a':['0.188070','80','80.000'],'b':['0.183050','73','73.000'],'c':['0.185320','26.95100000'],'v':['2405.87940845','2443.98986545'],'p':['0.181354','0.180358'],'t':[193,195],'l':['0.170000','0.170000'],'h':['0.185460','0.185460'],'o':'0.173250'}
        }
      };

      // Atomize Prices realtive to Asset
      pricesRelAsset = functions.krakenPricesRelAsset(data);

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

    it('Calculate sharePrice according to updated prices', (done) => {
      coreContract.calcSharePrice()
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
        done();
      });
    });

  });

  describe('WITHDRAWING FROM PORTFOLIO', () => {
    it('Wanted Shares == Offered Value', (done) => {
      // TODO parse from contract directly
      const currentDelta = 1029899999999999990;
      const offeredShares = new BigNumber(2e+17);
      const wantedValue = (new BigNumber(2e+17)).div(currentDelta);
      const expectedValue = new BigNumber(2e+17);

      let sharePrice;
      // TODO fix inital sharePrice value == 1 eth
      coreContract.calcSharePrice().then(() => coreContract.sharePrice())
      .then((result) => {
        sharePrice = result.toNumber();
        // TODO fix inital sharePrice value == 1 eth
        console.log(`Initial sharePrice ${sharePrice}`);
        return coreContract.annihilateShares(offeredShares, wantedValue, { from: NOT_OWNER });
      })
      .then((result) => {
        return coreContract.calcSharePrice();
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
            sharePrice = result.logs[i].args.delta.toNumber();
          }
        }
        //TODO fix sharePrice
      //   return coreContract.sharePrice();
      // })
      // .then((result) => {
      //   assert.strictEqual(result.toNumber(), sharePrice);
      //   return etherTokenContract.balanceOf(coreContract.address);
      // })
      // .then((result) => {
      //   assert.strictEqual(result.toNumber(), expectedValue.toNumber());
      //   return coreContract.balanceOf(NOT_OWNER);
      // })
      // .then((result) => {
      //   assert.strictEqual(result.toNumber(), expectedValue.toNumber());


        return coreContract.calcNAV();
      })
      .then((result) => {
        console.log(result)
        return coreContract.calcDelta();
      })
      .then((result) => {
        console.log(`calcDelta is: ${result / Math.pow(10, 18)}`)
        done();
      });
    });
  });
});
