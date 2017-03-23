const async = require('async');
const assert = require('assert');
const BigNumber = require('bignumber.js');
const constants = require('../utils/constants.js');
const functions = require('../utils/functions.js');

const EtherToken = artifacts.require('./EtherToken.sol');
const BitcoinToken = artifacts.require('./BitcoinToken.sol');
const RepToken = artifacts.require('./RepToken.sol');
const EuroToken = artifacts.require('./EuroToken.sol');
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
  // Atomize Prices realtive to Ether
  const pricesRelEther = functions.krakenPricesRelEther(data);

  let priceFeedTestCases = [];

  // Atomize Prices realtive to Asset
  const pricesRelAsset = functions.krakenPricesRelAsset(data);

  // Test globals
  let coreContract;
  let etherTokenContract;
  let bitcoinTokenContract;
  let euroTokenContract;
  let priceFeedContract;
  let exchangeContract;
  let universeContract;
  let riskmgmtContract;
  let exchangeTestCases;
  let riskmgmtTestCases;

  before('Check accounts, deploy modules, set testcase', () => {
    EtherToken.deployed().then((deployed) => { etherTokenContract = deployed; });
    BitcoinToken.deployed().then((deployed) => { bitcoinTokenContract = deployed; });
    PriceFeed.deployed().then((deployed) => { priceFeedContract = deployed; });
    Exchange.deployed().then((deployed) => { exchangeContract = deployed; });
    Universe.deployed().then((deployed) => { universeContract = deployed; });
    RiskMgmt.deployed().then((deployed) => { riskmgmtContract = deployed; });
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

  it('Define Price Feed testcase', () => {
    assets[0] = etherTokenContract.address;
    assets[1] = bitcoinTokenContract.address;
    for (let i = 0; i < assets.length; i += 1) {
      priceFeedTestCases.push({ address: assets[i], price: pricesRelEther[i] });
    }
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
          sell_how_much: Math.floor(pricesRelAsset[1] * (1 - (i * 0.1))),
          sell_which_token: bitcoinTokenContract.address,
          buy_how_much: 1 * constants.ether,
          buy_which_token: etherTokenContract.address,
          id: i + 1,
          owner: OWNER,
          active: true,
        }
      );
    }
    // riskmgmtTestCases = [];
    // for (let i = 0; i < NUM_OFFERS; i += 1) {
    //   riskmgmtTestCases.push(
    //     {
    //       sell_how_much: Math.floor(pricesRelAsset[1] * (1 - (i * 0.1))),
    //       sell_which_token: bitcoinTokenContract.address,
    //       buy_how_much: 1 * constants.ether,
    //       buy_which_token: etherTokenContract.address,
    //       id: i + 1,
    //       owner: OWNER,
    //       active: true,
    //     },
    //   );
    // }
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
      pricesRelAsset[1],
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

  // MAIN TESTING

  it('Create and Annihilate Shares by investing and withdrawing in a Core and ' +
      'calculate performance', (done) => {
    /* Investing and redeeming:
     *  Round 1 & 4: Exact
     *  Rount 2 & 5: Overpaid
     *  Round 3 & 6: Underpaid
     */
    const wantedShares = [new BigNumber(2e+18), new BigNumber(3e+18), new BigNumber(7e+18)];
    const investFunds = [new BigNumber(2e+18), new BigNumber(5e+18), new BigNumber(6e+18)];
    const correctPriceToBePaid = [new BigNumber(2e+18), new BigNumber(3e+18), new BigNumber(7e+18)];
    // const withdrawFunds = [2*999999999999977800, new BigNumber(1e+18), new BigNumber(7e+18)];
    const offeredShares = [new BigNumber(2e+18), new BigNumber(5e+18), new BigNumber(6e+18)];
    const redeemFunds = [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];
    // const correctPriceToBeReceived = [new BigNumber(2e+18), new BigNumber(3e+18), new BigNumber(7e+18)];


    // const correctPriceToBeReceived =
    //     [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];

    /* Managing
     *  Round 1:
     */
    const buy = [
      {
        exchange: exchangeContract.address,
        buy_how_much: Math.floor(pricesRelAsset[1]),
        id: 1,
      }
    ];

    coreContract.totalSupply()
    .then((result) => {
      assert.strictEqual(result.toNumber(), 0);

      // ROUND 1 EXACT
      return coreContract.createShares(wantedShares[0],
        { from: NOT_OWNER, value: investFunds[0].toNumber() });
    })
    // Check totalSupply and sumInvested
    .then(() => coreContract.totalSupply())
    .then((result) => {
      assert.strictEqual(result.toNumber(), wantedShares[0].toNumber());
    })
    .then(() => coreContract.sumInvested())
    .then((result) => {
      assert.strictEqual(result.toNumber(), correctPriceToBePaid[0].toNumber());

      // ROUND 2 0VERPAID
      return coreContract.createShares(wantedShares[1],
          { from: NOT_OWNER, value: investFunds[1].toNumber() });
    })
    // Check totalSupply and sumInvested
    .then(() => coreContract.totalSupply())
    .then((result) => {
      assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
    })
    .then(() => coreContract.sumInvested())
    .then((result) => {
      assert.strictEqual(result.toNumber(),
        correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());

      // ROUND 3 UNDERPAID
      return coreContract.createShares(wantedShares[2],
        { from: NOT_OWNER, value: investFunds[2].toNumber() });
    })
    // Check totalSupply and sumInvested
    .then(() => coreContract.totalSupply())
    .then((result) => {
      // Paid to little, hence no shares received
      assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
    })
    .then(() => coreContract.sumInvested())
    .then((result) => {
      // Paid to little, hence no investment made
      assert.strictEqual(result.toNumber(),
          correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());
      return coreContract.balanceOf(NOT_OWNER);
    })
    .then((result) => {
      const balance = wantedShares[0].add(wantedShares[1]).toNumber();
      assert.strictEqual(result.toNumber(), balance);

      // ROUND 3 MANAGING
      return coreContract.buy(buy[0].exchange, buy[0].id, buy[0].buy_how_much, { from: OWNER });
    })
    .then(() => etherTokenContract.balanceOf(coreContract.address))
    .then((result) => {
      console.log(`EtherToken held: \t\t${result.toString()}`);
      return bitcoinTokenContract.balanceOf(coreContract.address);
    })
    .then((result) => {
      console.log(`BitcoinToken held: \t\t${result.toString()}`);
      return coreContract.calcSharePrice();
    })
    .then((result) => {
      console.log(`New share price is: \t\t${result.toString()}`);
      //TODO Calculate more precise
      const roundingError = 0.01;
      console.log(`Round 4; Sell shares: \t\t${offeredShares[0]}`);
      console.log(`Round 4; Funds to redeem: \t${redeemFunds[0] * result.toString() / constants.ether * (1.0 - roundingError)}`);

      // ROUND 4 EXACT
      return coreContract.annihilateShares(offeredShares[0], redeemFunds[0] * result.toString() / constants.ether * (1.0 - roundingError), { from: NOT_OWNER });
    })
    .then(() => coreContract.totalSupply())
    .then((result) => {
      const balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
      assert.strictEqual(result.toNumber(), balance);
    })
    .then(() => coreContract.sumWithdrawn())
    .then((result) => {
      // TODO: calculate outside w commission etc.
      console.log(`Round 4; Funds received: \t${result.toNumber()}`);
      // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].toNumber());
    })
    .then(() => coreContract.balanceOf(NOT_OWNER))
    .then((result) => {
      const balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
      assert.strictEqual(result.toNumber(), balance);
    })
    // // ROUND 5 OVERPAID
    // .then(() => coreContract.annihilateShares(offeredShares[1], 10000, { from: NOT_OWNER }))
    // .then(() => coreContract.totalSupply())
    // .then((result) => {
    //   const balance = wantedShares[0]
    //     .add(wantedShares[1]).minus(offeredShares[0]).minus(offeredShares[1]).toNumber();
    //   assert.strictEqual(result.toNumber(), balance);
    // })
    // // Check sumInvested
    // .then(() => coreContract.sumWithdrawn())
    // .then(() => {
    //   // TODO: calculate outside w commission etc.
    //   // console.log('Sold shares: ' + offeredShares[1]);
    //   // console.log('Funds received (total): ' + result.toNumber());
    //   // assert.strictEqual(result.toNumber(),
    //   //     correctPriceToBeReceived[0].add(correctPriceToBeReceived[1]).toNumber());
    // })
    // .then(() => {
    //   // TODO: calculate outside w commission, performance gains, loses etc.
    //   // for (i = 0; i < numAccounts; ++i) {
    //   //   // Actual Balance
    //   //   var balance = web3.eth.getBalance(web3.eth.accounts[i],'ether');
    //   //   // >=, since actual balance has a gas cost for sending the tx.
    //   //   // TODO: Estimate Gas cost
    //   //   console.log(' Gas cost of Account ' + i + ':',
    //   //       balances[i].minus(balance).dividedBy('10e+18').toNumber());
    //   //   assert.isTrue(balances[i].greaterThanOrEqualTo(balance),
    //   //       "One of the Accounts has wrong balance!")
    //   // };
    // })
    .then(done)
    .catch(done);
  });
});
