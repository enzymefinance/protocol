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
  const NUM_OFFERS = 3;
  const ALLOWANCE_AMOUNT = SolConstants.PREMINED_AMOUNT / 10;

  // Test globals
  let contract;
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
          return Exchange.new({ from: OWNER });
        })
        .then((result) => {
          exchangeContract = result;
          return Registrar.new(
            [
              bitcoinTokenContract.address,
              dollarTokenContract.address,
              euroTokenContract.address,
            ], [
              priceFeedContract.address,
              priceFeedContract.address,
              priceFeedContract.address,
            ], [
              exchangeContract.address,
              exchangeContract.address,
              exchangeContract.address,
            ], { from: OWNER },
          );
        })
        .then((result) => {
          registrarContract = result;
          return Trading.new(exchangeContract.address, { from: OWNER });
        })
        .then((result) => {
          tradingContract = result;
          // Set testCasesPriceFeed
          testCasesPriceFeed = [
            {
              address: bitcoinTokenContract.address,
              price: Helpers.inverseAtomizedPrices[0],
            },
            {
              address: dollarTokenContract.address,
              price: Helpers.inverseAtomizedPrices[1],
            },
            {
              address: euroTokenContract.address,
              price: Helpers.inverseAtomizedPrices[2],
            },
          ];
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
          sell_how_much: Helpers.atomizedPrices[0] * (1 - (i * 0.1)),
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
        exchangeContract.offers(testCase.id,
        ).then(() => {
          // const sellHowMuch = result[0];
          // const buyHowMuch = result[2];
          // console.log(testCase.id, sellHowMuch.toNumber(), buyHowMuch.toNumber());
          callbackMap(null, testCase);
        });
      },
      (err, results) => {
        testCasesExchange = results;
        done();
      },
    );
  });

  it('Deploy smart contract', (done) => {
    Core.new(etherTokenContract.address, registrarContract.address, tradingContract.address)
        .then((result) => {
          contract = result;
          return contract.sumInvested();
        })
        .then((result) => {
          assert.equal(result.toNumber(), 0);
          done();
        });
  });

  // MAIN TESTING

  // Set Prices
  const priceGraph = [];
  // Price in Wei/Asset
  priceGraph.push(new BigNumber(9.0909091e+16)); // 1 ETH = 11 USD
  priceGraph.push(new BigNumber(1e+17)); // 1 ETH = 10 USD
  priceGraph.push(new BigNumber(8.3333333e+16)); // 1 ETH = 12 USD
  // Accounts.setPrice(priceFeeds, priceGraph[0]);

  it('Create and Annihilate Shares by investing and withdrawing in a Core and calculate performance', (done) => {
    // Investment Round 1 by Account 1
    //  Parameters

    /* Investing:
     *  Round 1: Exact
     *  Rount 2: Overpaid
     *  Round 3: Underpaid
     */
    const wantedShares = [];
    wantedShares.push(new BigNumber(2e+18));
    wantedShares.push(new BigNumber(3e+18));
    wantedShares.push(new BigNumber(7e+18));

    const investFunds = [];
    investFunds.push(new BigNumber(2e+18));
    investFunds.push(new BigNumber(5e+18));
    investFunds.push(new BigNumber(6e+18));

    const correctPriceToBePaid = [];
    correctPriceToBePaid.push(new BigNumber(2e+18));
    correctPriceToBePaid.push(new BigNumber(3e+18));
    correctPriceToBePaid.push(new BigNumber(7e+18));

    /* Buying
     *  Round 1:
     */
    const buyUST = [];
    buyUST.push(new BigNumber(1e+18));

    /* Withdrawing:
     *  Round 1: Exact
     *  Rount 2: Overpaid
     *  Round 3: Underpaid
     */
    const withdrawFunds = [];
    withdrawFunds.push(new BigNumber(2e+18));
    withdrawFunds.push(new BigNumber(1e+18));
    withdrawFunds.push(new BigNumber(7e+18));

    const offeredShares = [];
    offeredShares.push(new BigNumber(2e+18));
    offeredShares.push(new BigNumber(1e+18));
    offeredShares.push(new BigNumber(7e+18));

    const correctPriceToBeReceived = [];
    correctPriceToBeReceived.push(new BigNumber(2e+18));
    correctPriceToBeReceived.push(new BigNumber(1e+18));
    correctPriceToBeReceived.push(new BigNumber(7e+18));

    // // Subtract investment amount
    // balances[0] = balances[0].minus(correctPriceToBePaid[0]);
    // balances[1] = balances[1].minus(correctPriceToBePaid[1]);
    // balances[2] = balances[2].minus(correctPriceToBePaid[2]);
    //
    // // Add withdrawal amount
    // balances[0] = balances[0].add(correctPriceToBeReceived[0]);
    // balances[1] = balances[1].add(correctPriceToBeReceived[1]);
    // balances[2] = balances[2].add(correctPriceToBeReceived[2]);


    contract.totalSupply()
        .then((result) => {
          assert.strictEqual(result.toNumber(), 0);
          // ROUND 1 EXACT
          return contract.createShares(wantedShares[0],
              { from: OWNER, value: investFunds[0].toNumber() });
        })
        .then(() =>
          // Check totalSupply
           contract.totalSupply())
        .then((result) => {
          assert.strictEqual(result.toNumber(), wantedShares[0].toNumber());
        })
        .then(() =>
          // Check sumInvested
           contract.sumInvested())
        .then((result) => {
          // TODO: calculate sumInvested via Smart Contract
          assert.strictEqual(result.toNumber(), investFunds[0].toNumber());
          return etherTokenContract.balanceOf(contract.address);
        })
        // .then((result) => {
        //   console.log(result.toNumber());
        // })
        .then(() =>
          // ROUND 2 0VERPAID
           contract.createShares(wantedShares[1],
               { from: accounts[1], value: investFunds[1].toNumber() }))
        .then(() =>
          // Check totalSupply
           contract.totalSupply())
        .then((result) => {
          assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
        })
        .then(() =>
          // Check sumInvested
           contract.sumInvested())
        .then((result) => {
          // TODO: calculate sumInvested via Smart Contract
          assert.strictEqual(result.toNumber(),
              correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());
        })
        .then(() =>
        //   // ROUND 3 MANAGING
        //   return contract.buy(1, buyUST[0], {from: accounts[1]});
        // }).then((result) => {
        //   return UST.totalSupply()
        // }).then((result) => {
        //   console.log('Total Token Supply: ' + result.toNumber());
        //   console.log('Total Token Bought: ' + buyUST[0].dividedBy(priceGraph[0]).toNumber());
        // }).then((result) => {
        //   // Price changes
        //   return UST.setPrices(priceGraph[1], {from: OWNER});
        // }).then((result) => {

          // ROUND 3
           contract.createShares(wantedShares[2],
               { from: accounts[2], value: investFunds[2].toNumber() }))
        .then(() =>
          // Check totalSupply
           contract.totalSupply())
        .then((result) => {
          // Paid to little, hence no shares received
          assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
        })
        .then(() =>
          // Check sumInvested
           contract.sumInvested())
        .then((result) => {
           // Paid to little, hence no investment made
          assert.strictEqual(result.toNumber(),
              correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());
          // ROUND 4 Withdrawal
          return contract.annihilateShares(offeredShares[0], withdrawFunds[0], { from: OWNER });
        })
        .then(() =>
          // Check totalSupply
           contract.totalSupply())
        .then((result) => {
          const balance = wantedShares[0]
              .add(wantedShares[1])
              .minus(offeredShares[0])
              .toNumber();
          assert.strictEqual(result.toNumber(), balance);
        })
        .then(() =>
          // Check sumInvested
          contract.sumWithdrawn())
        // .then((result) => {
          // TODO: calculate outside w commission etc.
          // console.log(`Sold shares: ${offeredShares[0]}`);
          // console.log(`Funds received: ${result.toNumber()}`);
          // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].toNumber());
        // })
        .then(() =>
          // ROUND 5
           contract.annihilateShares(offeredShares[1], withdrawFunds[1], { from: accounts[1] }))
        .then(() =>
          // Check totalSupply
           contract.totalSupply())
        .then((result) => {
          const balance = wantedShares[0].add(wantedShares[1])
              .minus(offeredShares[0]).minus(offeredShares[1]).toNumber();
          assert.strictEqual(result.toNumber(), balance);
        })
        .then(() =>
          // Check sumInvested
          contract.sumWithdrawn())
        // .then((result) => {
          // TODO: calculate outside w commission etc.
          // console.log(`Sold shares: ${offeredShares[1]}`);
          // console.log(`Funds received (total): ${result.toNumber()}`);
          // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0]
          //     .add(correctPriceToBeReceived[1]).toNumber());
        // })
        .then(() => {
          // TODO: calculate outside w commission, performance gains, loses etc.
          // for (i = 0; i < numAccounts; ++i) {
          //   // Actual Balance
          //   var balance = web3.eth.getBalance(web3.eth.accounts[i],'ether');
          //   // >=, since actual balance has a gas cost for sending the tx.
          //   // TODO: Estimate Gas cost
          //   console.log(' Gas cost of Account ' + i + ':',
          //       balances[i].minus(balance).dividedBy('10e+18').toNumber());
          //   assert.isTrue(balances[i].greaterThanOrEqualTo(balance),
          //       "One of the Accounts has wrong balance!")
          // };

          // contract({value: "1"});
        })
        .then(done)
        .catch(done);
  });
});
