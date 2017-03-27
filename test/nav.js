const async = require('async');
const assert = require('assert');
const BigNumber = require('bignumber.js');
const constants = require('../utils/constants.js');
const functions = require('../utils/functions.js');

const AssetProtocol = artifacts.require('./AssetProtocol.sol');
const EtherToken = artifacts.require('./EtherToken.sol');
const BitcoinToken = artifacts.require('./BitcoinToken.sol');
const PriceFeed = artifacts.require('PriceFeed.sol');
const Exchange = artifacts.require('Exchange.sol');
const Universe = artifacts.require('Universe.sol');
const RiskMgmt = artifacts.require('RiskMgmt.sol');
const Core = artifacts.require('Core.sol');

contract('Net Asset Value', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const ADDRESS_PLACEHOLDER = '0x0';
  const NUM_OFFERS = 1;
  const ALLOWANCE_AMOUNT = constants.PREMINED_AMOUNT / 10;

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

  // Atomize Prices realtive to Asset
  const pricesRelAsset = functions.krakenPricesRelAsset(data);

  // Test globals
  let coreContract;
  let etherTokenContract;
  let bitcoinTokenContract;
  let priceFeedContract;
  let exchangeContract;
  let universeContract;
  let riskmgmtContract;
  let exchangeTestCases;
  let riskmgmtTestCases;


  describe('PREPARATIONS', () => {
    before('Check accounts, deploy modules, set testcase', () => {
      EtherToken.deployed().then((deployed) => { etherTokenContract = deployed; });
      BitcoinToken.deployed().then((deployed) => { bitcoinTokenContract = deployed; });
      PriceFeed.deployed().then((deployed) => { priceFeedContract = deployed; });
      Exchange.deployed().then((deployed) => { exchangeContract = deployed; });
      Universe.deployed().then((deployed) => { universeContract = deployed; });
      RiskMgmt.deployed().then((deployed) => { riskmgmtContract = deployed; });
    });

    it('Define Price Feed testcase', () => {
      universeContract.numAssignedAssets()
      .then((numAssets) => {
        for (let i = 0; i < numAssets; i += 1) {
          universeContract.assetAt(i)
          .then((assetAddr) => {
            assets.push(assetAddr);
            AssetProtocol.at(assetAddr).getSymbol().then((symbol) => {
              priceFeedTestCases.push({ address: assetAddr, price: pricesRelEther[i], symbol });
            })
          })
        }
      });
    });

    it('Deploy smart contract', (done) => {
      Core.new(OWNER,
        universeContract.address,
        riskmgmtContract.address,
        ADDRESS_PLACEHOLDER,
        ADDRESS_PLACEHOLDER,
        { from: OWNER })
          .then((result) => {
            coreContract = result;
            return coreContract.sumInvested();
          })
          .then((result) => {
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
          // TODO test against actual block.time
          assert.notEqual(result.logs[i].args.atTimestamp.toNumber(), 0);
          assert.equal(result.logs[i].args.ofPrice, pricesRelEther[i]);
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
            sell_how_much: Math.floor(pricesRelAsset[2] * (1 - (i * 0.1))),
            sell_which_token: bitcoinTokenContract.address,
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

    it('OWNER approves exchange to hold funds of bitcoinTokenContract', (done) => {
      bitcoinTokenContract.approve(exchangeContract.address, ALLOWANCE_AMOUNT, { from: OWNER })
      .then(() => bitcoinTokenContract.allowance(OWNER, exchangeContract.address))
      .then((result) => {
        assert.equal(result, ALLOWANCE_AMOUNT);
        done();
      });
    });

    it('Create one side of the orderbook', (done) => {
      // const bitcoinTokenAddress = specs.tokens[specs.network]['BTC-T'];
      functions.buyOneEtherFor(
        pricesRelAsset[2],
        bitcoinTokenContract.address,
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
      async.mapSeries(
        exchangeTestCases,
        (testCase, callbackMap) => {
          exchangeContract.offers(testCase.id)
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
      const offeredValue = new BigNumber(2e+17);
      const expectedValue = new BigNumber(2e+17);

      coreContract.createShares(wantedShares, { from: NOT_OWNER, value: offeredValue })
      .then((result) => {
        // Check Logs
        assert.notEqual(result.logs.length, 0);
        console.log('Initial Portfolio Content');
        for (let i = 0; i < result.logs.length; i += 1) {
          if (result.logs[i].event === 'PortfolioContent') {
            const divider = Math.pow(10, result.logs[i].args.assetDecimals.toNumber());
            console.log(` ${i}: ${result.logs[i].args.assetHoldings / divider} Asset @ ${result.logs[i].args.assetPrice / divider}`);
          }
          if (result.logs[i].event === 'NetAssetValue') {
            console.log(`NAV: ${result.logs[i].args.nav.toNumber() / Math.pow(10, 18)}`);
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
      const offeredValue = new BigNumber(2e+17);
      const expectedValue = new BigNumber(3e+17); // 0.2 from previous test

      coreContract.createShares(wantedShares, { from: NOT_OWNER, value: offeredValue })
      .then((result) => {
        // Check Logs
        assert.notEqual(result.logs.length, 0);
        console.log('Initial Portfolio Content');
        for (let i = 0; i < result.logs.length; i += 1) {
          if (result.logs[i].event === 'PortfolioContent') {
            const divider = Math.pow(10, result.logs[i].args.assetDecimals.toNumber());
            console.log(` ${i}: ${result.logs[i].args.assetHoldings / divider} Asset @ ${result.logs[i].args.assetPrice / divider}`);
          }
          if (result.logs[i].event === 'NetAssetValue') {
            console.log(`NAV: ${result.logs[i].args.nav.toNumber() / Math.pow(10, 18)}`);
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
      const offeredValue = new BigNumber(1e+17);
      const expectedValue = new BigNumber(3e+17); // 0.2 from previous test

      coreContract.createShares(wantedShares, { from: NOT_OWNER, value: offeredValue })
      .then((result) => {
        // Check Logs
        assert.notEqual(result.logs.length, 0);
        console.log('Initial Portfolio Content');
        for (let i = 0; i < result.logs.length; i += 1) {
          if (result.logs[i].event === 'PortfolioContent') {
            const divider = Math.pow(10, result.logs[i].args.assetDecimals.toNumber());
            console.log(` ${i}: ${result.logs[i].args.assetHoldings / divider} Asset @ ${result.logs[i].args.assetPrice / divider}`);
          }
          if (result.logs[i].event === 'NetAssetValue') {
            console.log(`NAV: ${result.logs[i].args.nav.toNumber() / Math.pow(10, 18)}`);
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
  });

  describe('MANAGING POSITIONS OF A PORTFOLIO', () => {
    it('Manage Postion', (done) => {
      // const correctPriceToBeReceived = [new BigNumber(2e+18), new BigNumber(3e+18), new BigNumber(7e+18)];
      // const correctPriceToBeReceived =
      //     [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];

      /* Managing
       *  Round 1:
       */
      const buy = [
        {
          exchange: exchangeContract.address,
          buy_how_much: Math.floor(pricesRelAsset[2]),
          id: 1,
        }
      ];

      console.log(buy);

      // ROUND 3 MANAGING
      coreContract.buy(buy[0].exchange, buy[0].id, buy[0].buy_how_much, { from: OWNER })
      .then((result) => {
        // Check Logs
        assert.notEqual(result.logs.length, 0);
        console.log('Initial Portfolio Content');
        for (let i = 0; i < result.logs.length; i += 1) {
          if (result.logs[i].event === 'SpendingApproved') {
            console.log(result.logs[i].args.ofToken)
            console.log(result.logs[i].args.ofApprovalExchange)
            console.log(result.logs[i].args.approvalAmount.toNumber())
          }
        }
        return coreContract.calcSharePrice();
      })
      .then((result) => {
        console.log(result);
        console.log(`New share price is: \t\t${result.toString()}`);
        done();
      });
    });
  });

  describe('WITHDRAWING FROM PORTFOLIO', () => {
    const withdrawFunds = [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];
    const offeredShares = [new BigNumber(2e+18), new BigNumber(5e+18), new BigNumber(6e+18)];
    const redeemFunds = [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];

    // coreContract.annihilateShares(offeredShares[0], redeemFunds[0] * result.toString() / constants.ether * (1.0 - roundingError), { from: NOT_OWNER });
    // })
    // .then(() => coreContract.totalSupply())
    // .then((result) => {
    // const balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
    // assert.strictEqual(result.toNumber(), balance);
    // })
    // .then(() => coreContract.sumWithdrawn())
    // .then((result) => {
    // // TODO: calculate outside w commission etc.
    // console.log(`Round 4; Funds received: \t${result.toNumber()}`);
    // // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].toNumber());
    // })
    // .then(() => coreContract.balanceOf(NOT_OWNER))
    // .then((result) => {
    // const balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
    // assert.strictEqual(result.toNumber(), balance);
    // })
    // // // ROUND 5 OVERPAID
    // // .then(() => coreContract.annihilateShares(offeredShares[1], 10000, { from: NOT_OWNER }))
    // // .then(() => coreContract.totalSupply())
    // // .then((result) => {
    // //   const balance = wantedShares[0]
    // //     .add(wantedShares[1]).minus(offeredShares[0]).minus(offeredShares[1]).toNumber();
    // //   assert.strictEqual(result.toNumber(), balance);
    // // })
    // // // Check sumInvested
    // // .then(() => coreContract.sumWithdrawn())
    // // .then(() => {
    // //   // TODO: calculate outside w commission etc.
    // //   // console.log('Sold shares: ' + offeredShares[1]);
    // //   // console.log('Funds received (total): ' + result.toNumber());
    // //   // assert.strictEqual(result.toNumber(),
    // //   //     correctPriceToBeReceived[0].add(correctPriceToBeReceived[1]).toNumber());
    // // })
    // // .then(() => {
    // //   // TODO: calculate outside w commission, performance gains, loses etc.
    // //   // for (i = 0; i < numAccounts; ++i) {
    // //   //   // Actual Balance
    // //   //   var balance = web3.eth.getBalance(web3.eth.accounts[i],'ether');
    // //   //   // >=, since actual balance has a gas cost for sending the tx.
    // //   //   // TODO: Estimate Gas cost
    // //   //   console.log(' Gas cost of Account ' + i + ':',
    // //   //       balances[i].minus(balance).dividedBy('10e+18').toNumber());
    // //   //   assert.isTrue(balances[i].greaterThanOrEqualTo(balance),
    // //   //       "One of the Accounts has wrong balance!")
    // //   // };
    // // })
  });
});
