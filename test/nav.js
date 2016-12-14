const async = require('async');
const assert = require('assert');
const BigNumber = require('bignumber.js');
const Helpers = require('../lib/Helpers.js');
const SolKeywords = require('../lib/SolKeywords.js');
const SolConstants = require('../lib/SolConstants.js');


contract('Net Asset Value', (accounts) => {
  // Test constants
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const ADDRESS_PLACEHOLDER = '0x0';
  const NUM_OFFERS = 3;
  const ALLOWANCE_AMOUNT = SolConstants.PREMINED_AMOUNT / 10;
  const DATA = { BTC: 0.01117, USD: 8.45, EUR: 7.92 };

  // Test globals
  let coreContract;
  let etherTokenContract;
  let bitcoinTokenContract;
  let dollarTokenContract;
  let euroTokenContract;
  let priceFeedContract;
  let exchangeContract;
  let registrarContract;
  let tradingContract;
  let testCasesPriceFeed;
  let testCasesExchange;
  let lastOfferId = 0;


  before('Check accounts, deploy modules, set testcase', (done) => {
    assert.equal(accounts.length, 10);

    EtherToken.new({ from: OWNER })
        .then((result) => {
          etherTokenContract = result;
          return BitcoinToken.new({ from: OWNER });
        })
        .then((result) => {
          bitcoinTokenContract = result;
          return DollarToken.new({ from: OWNER });
        })
        .then((result) => {
          dollarTokenContract = result;
          return EuroToken.new({ from: OWNER });
        })
        .then((result) => {
          euroTokenContract = result;
          return PriceFeed.new({ from: OWNER });
        })
        .then((result) => {
          priceFeedContract = result;
          testCasesPriceFeed = [ // Set testCasesPriceFeed
            {
              address: bitcoinTokenContract.address,
              price: Helpers.createInverseAtomizedPrices(DATA)[0],
            },
            {
              address: dollarTokenContract.address,
              price: Helpers.createInverseAtomizedPrices(DATA)[1],
            },
            {
              address: euroTokenContract.address,
              price: Helpers.createInverseAtomizedPrices(DATA)[2],
            },
          ];
          return Exchange.new({ from: OWNER });
        })
        .then((result) => {
          exchangeContract = result;
          return Registrar.new(
            [
              etherTokenContract.address,
              bitcoinTokenContract.address,
              dollarTokenContract.address,
              euroTokenContract.address,
            ], [
              priceFeedContract.address,
              priceFeedContract.address,
              priceFeedContract.address,
              priceFeedContract.address,
            ], [
              exchangeContract.address,
              exchangeContract.address,
              exchangeContract.address,
              exchangeContract.address,
            ], { from: OWNER });
        })
        .then((result) => {
          registrarContract = result;
          return Trading.new(exchangeContract.address, { from: OWNER });
        })
        .then((result) => {
          tradingContract = result;
          done();
        });
  });

  it('Deploy smart contract', (done) => {
    Core.new(registrarContract.address,
      tradingContract.address,
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
    const addresses = [
      testCasesPriceFeed[0].address,
      testCasesPriceFeed[1].address,
      testCasesPriceFeed[2].address,
    ];
    const inverseAtomizedPrices = [
      testCasesPriceFeed[0].price,
      testCasesPriceFeed[1].price,
      testCasesPriceFeed[2].price,
    ];
    priceFeedContract.setPrice(addresses, inverseAtomizedPrices, { from: OWNER })
        .then(() => priceFeedContract.lastUpdate())
        .then((result) => {
          assert.notEqual(result.toNumber(), 0);
          done();
        });
  });

  it('Get multiple existent prices', (done) => {
    async.mapSeries(
      testCasesPriceFeed,
      (testCase, callbackMap) => {
        priceFeedContract.getPrice(testCase.address, { from: NOT_OWNER })
            .then((result) => {
              assert.notEqual(result, testCase.price);
              callbackMap(null, testCase);
            });
      },
      (err, results) => {
        testCasesPriceFeed = results;
        done();
      });
  });

  it('Set up test cases', (done) => {
    testCasesExchange = [];
    for (let i = 0; i < NUM_OFFERS; i += 1) {
      testCasesExchange.push(
        {
          sell_how_much: Helpers.createAtomizedPrices(DATA)[0] * (1 - (i * 0.1)),
          sell_which_token: bitcoinTokenContract.address,
          buy_how_much: 1 * SolKeywords.ether,
          buy_which_token: etherTokenContract.address,
          id: i + 1,
          owner: OWNER,
          active: true,
        },
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
    async.mapSeries(
      testCasesExchange,
      (testCase, callbackMap) => {
        exchangeContract.offer(
          testCase.sell_how_much,
          testCase.sell_which_token,
          testCase.buy_how_much,
          testCase.buy_which_token,
          { from: OWNER },
        ).then((txHash) => {
          const result = Object.assign({ txHash }, testCase);
          callbackMap(null, result);
        });
      },
      (err, results) => {
        testCasesExchange = results;
        done();
      },
    );
  });

  it('Check if orders created', (done) => {
    exchangeContract.lastOfferId({ from: OWNER },
    ).then((result) => {
      lastOfferId = result.toNumber();
      assert.equal(lastOfferId, NUM_OFFERS);
      done();
    });
  });

  it('Check orders information', (done) => {
    async.mapSeries(
      testCasesExchange,
      (testCase, callbackMap) => {
        exchangeContract.offers(testCase.id)
            .then(() => {
              callbackMap(null, testCase);
            });
      },
      (err, results) => {
        testCasesExchange = results;
        done();
      },
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
    const offeredShares = [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];
    // const correctPriceToBeReceived =
    //     [new BigNumber(2e+18), new BigNumber(1e+18), new BigNumber(7e+18)];

    /* Managing
     *  Round 1:
     */
    const buy = [
      {
        exchange: exchangeContract.address,
        buy_how_much: Helpers.createAtomizedPrices(DATA)[0],
        id: 1,
      },
    ];

    coreContract.totalSupply()
        .then((result) => {
          assert.strictEqual(result.toNumber(), 0);
          // ROUND 1 EXACT
          return coreContract.createShares(
              wantedShares[0], { from: OWNER, value: investFunds[0].toNumber() });
        })
        .then(() => coreContract.totalSupply())
        .then((result) => {
          assert.strictEqual(result.toNumber(), wantedShares[0].toNumber());
        })
        // Check sumInvested
        .then(() => coreContract.sumInvested())
        .then((result) => {
          // TODO: calculate sumInvested via Smart Contract
          assert.strictEqual(result.toNumber(), investFunds[0].toNumber());
          // ROUND 2 0VERPAID
          return coreContract.createShares(wantedShares[1],
              { from: accounts[1], value: investFunds[1].toNumber() });
        })
        .then(() => coreContract.totalSupply())
        .then((result) => {
          assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
        })
        .then(() => coreContract.sumInvested())
        .then((result) => {
          // TODO: calculate sumInvested via Smart Contract
          assert.strictEqual(result.toNumber(),
              correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());
        })
        .then(() => coreContract.createShares(wantedShares[2],
              { from: accounts[2], value: investFunds[2].toNumber() }))
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
          // ROUND 3 MANAGING
          return coreContract.approveSpending(etherTokenContract.address,
              1000 * SolKeywords.ether, { from: OWNER });
        })
        .then(() => etherTokenContract.allowance(coreContract.address, buy[0].exchange))
        .then((result) => {
          assert.equal(result, 1000 * SolKeywords.ether);
          // console.log(buy[0].exchange, buy[0].id, buy[0].buy_how_much)
          return coreContract.buy(buy[0].exchange, buy[0].id, buy[0].buy_how_much, { from: OWNER });
        })
        .then(() => etherTokenContract.balanceOf(coreContract.address))
        .then((result) => {
          console.log('EtherToken held: ', result.toNumber());
          return bitcoinTokenContract.balanceOf(coreContract.address);
        })
        .then((result) => {
          console.log('BitcoinToken held: ', result.toNumber());
          return coreContract.calcSharePrice();
        })
        .then((result) => {
          console.log('New share price is: ', result.toString());

          // ROUND 4 EXACT
          return coreContract.annihilateShares(offeredShares[0], 10000, { from: OWNER });
        })
        .then(() => coreContract.totalSupply())
        .then((result) => {
          const balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
          assert.strictEqual(result.toNumber(), balance);
        })
        .then(() => coreContract.sumWithdrawn())
        .then(() => {
          // TODO: calculate outside w commission etc.
          // console.log(`Sold shares: ${offeredShares[0]}`);
          // console.log(`Funds received: ${result.toNumber()}`);
          // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].toNumber());
        })
        // ROUND 5 OVERPAID
        .then(() => coreContract.annihilateShares(offeredShares[1], 10000, { from: accounts[1] }))
        .then(() => coreContract.totalSupply())
        .then((result) => {
          const balance = wantedShares[0]
              .add(wantedShares[1]).minus(offeredShares[0]).minus(offeredShares[1]).toNumber();
          assert.strictEqual(result.toNumber(), balance);
        })
        // Check sumInvested
        .then(() => coreContract.sumWithdrawn())
        .then(() => {
          // TODO: calculate outside w commission etc.
          // console.log('Sold shares: ' + offeredShares[1]);
          // console.log('Funds received (total): ' + result.toNumber());
          // assert.strictEqual(result.toNumber(),
          //     correctPriceToBeReceived[0].add(correctPriceToBeReceived[1]).toNumber());
        })
        .then(() => {
          // TODO: calculate outside w commission, performance gains, loses etc.
          // for (i = 0; i < numAccounts; ++i) {
          //   // Actual Balance
          //   var balance = web3.eth.getBalance(web3.eth.accounts[i],'ether');
          //   // >=, since actual balance has a gas cost for sending the tx.
          //   // TODO: Estimate Gas cost
          //   console.log(' Gas cost of Account ' + i + ':',
          //       balances[i].minus(balance).dividedBy('10e+18').toNumber());
            // assert.isTrue(balances[i].greaterThanOrEqualTo(balance),
            //     "One of the Accounts has wrong balance!")
          // };
        })
        .then(done)
        .catch(done);
  });
});
