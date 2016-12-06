var async = require('async');
var assert = require('assert');
var BigNumber = require('bignumber.js');
var Helpers = require('../lib/Helpers.js');
var SolKeywords = require('../lib/SolKeywords.js');
var SolConstants = require('../lib/SolConstants.js');


contract('Net Asset Value', (accounts) => {

  // Test constants
  const INITIAL_OFFER_ID = 0;
  const OWNER = accounts[0];
  const NOT_OWNER = accounts[1];
  const NUM_OFFERS = 3;
  const ALLOWANCE_AMOUNT = SolConstants.PREMINED_AMOUNT / 10;

  // Test globals
  let contract,
    etherTokenContract,
    bitcoinTokenContract,
    dollarTokenContract,
    euroTokenContract,
    priceFeedContract,
    exchangeContract,
    registrarContract,
    tradingContract;
  let testCasesPriceFeed,
    testCasesExchange;
  let lastOfferId = 0;


  before('Check accounts, deploy modules, set testcase', (done) => {
    assert.equal(accounts.length, 10);

    EtherToken.new({ from: OWNER }).then((result) => {
      etherTokenContract = result;
      return BitcoinToken.new({ from: OWNER });
    }).then((result) => {
      bitcoinTokenContract = result;
      return DollarToken.new({ from: OWNER });
    }).then((result) => {
      dollarTokenContract = result;
      return EuroToken.new({ from: OWNER });
    }).then((result) => {
      euroTokenContract = result;
      return PriceFeed.new({ from: OWNER });
    }).then((result) => {
      priceFeedContract = result;
      testCasesPriceFeed = [ // Set testCasesPriceFeed
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
      return Exchange.new({ from: OWNER });
    }).then((result) => {
      exchangeContract = result;
      return Registrar.new(
        [
          bitcoinTokenContract.address,
          dollarTokenContract.address,
          euroTokenContract.address
        ], [
          priceFeedContract.address,
          priceFeedContract.address,
          priceFeedContract.address,
        ], [
          exchangeContract.address,
          exchangeContract.address,
          exchangeContract.address,
        ], { from: OWNER }
      );
    }).then((result) => {
      registrarContract = result;
      return Trading.new(exchangeContract.address, { from: OWNER });
    }).then((result) => {
      tradingContract = result;
      done();
    });
  });

  it('Deploy smart contract', (done) => {
    Core.new(etherTokenContract.address, registrarContract.address,
      tradingContract.address, exchangeContract.address, { from: OWNER }).then((result) => {
      contract = result;
      return contract.sumInvested();
    }).then((result) => {
      assert.equal(result.toNumber(), 0);
      done();
    });
  });

  it('Set multiple price', (done) => {
    const addresses = [testCasesPriceFeed[0].address, testCasesPriceFeed[1].address, testCasesPriceFeed[2].address];
    const inverseAtomizedPrices = [testCasesPriceFeed[0].price, testCasesPriceFeed[1].price, testCasesPriceFeed[2].price];
    priceFeedContract.setPrice(addresses, inverseAtomizedPrices, { from: OWNER }).then((result) => {
      return priceFeedContract.lastUpdate();
    }).then((result) => {
      assert.notEqual(result.toNumber(), 0);
      done();
    });
  });

  it('Get multiple existent prices', (done) => {
    async.mapSeries(
      testCasesPriceFeed,
      (testCase, callbackMap) => {
      priceFeedContract.getPrice(testCase.address, { from: NOT_OWNER }
      ).then((result) => {
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
    for (let i = 0; i < NUM_OFFERS; i++) {
      testCasesExchange.push(
        {
          sell_how_much: Helpers.atomizedPrices[0] * (1 - i*0.1),
          sell_which_token: bitcoinTokenContract.address,
          buy_how_much: 1 * SolKeywords.ether,
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
    bitcoinTokenContract.approve(exchangeContract.address, ALLOWANCE_AMOUNT, { from: OWNER }
    ).then((result) => {
      return bitcoinTokenContract.allowance(OWNER, exchangeContract.address);
    }).then((result) => {
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
          { from: OWNER }
        ).then((result) => {
          testCase.txHash = result;
          callbackMap(null, testCase);
        });
      },
      (err, results) => {
        testCasesExchange = results;
        done();
      }
    );
  });

  it('Check if orders created', (done) => {
    exchangeContract.lastOfferId({ from: OWNER }
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
          exchangeContract.offers(testCase.id
        ).then((result) => {
          callbackMap(null, testCase);
        });
      },
      (err, results) => {
        testCasesExchange = results;
        done();
      }
    );
  });

  // MAIN TESTING

  it("Create and Annihilate Shares by investing and withdrawing in a Core and calculate performance",(done) => {
    // Investment Round 1 by Account 1
    //  Parameters

    /* Investing:
     *  Round 1: Exact
     *  Rount 2: Overpaid
     *  Round 3: Underpaid
     */
    var wantedShares = [];
    wantedShares.push(new BigNumber(2e+18));
    wantedShares.push(new BigNumber(3e+18));
    wantedShares.push(new BigNumber(7e+18));

    var investFunds = [];
    investFunds.push(new BigNumber(2e+18));
    investFunds.push(new BigNumber(5e+18));
    investFunds.push(new BigNumber(6e+18));

    var correctPriceToBePaid = [];
    correctPriceToBePaid.push(new BigNumber(2e+18));
    correctPriceToBePaid.push(new BigNumber(3e+18));
    correctPriceToBePaid.push(new BigNumber(7e+18));

    /* Managing
     *  Round 1:
     */
    var buy = [];
    buy.push({ buy_how_much: Helpers.atomizedPrices[0], id: 1 });

    /* Withdrawing:
     *  Round 1: Exact
     *  Rount 2: Overpaid
     *  Round 3: Underpaid
     */
    var withdrawFunds = [];
    withdrawFunds.push(new BigNumber(2e+18));
    withdrawFunds.push(new BigNumber(1e+18));
    withdrawFunds.push(new BigNumber(7e+18));

    var offeredShares = [];
    offeredShares.push(new BigNumber(2e+18));
    offeredShares.push(new BigNumber(1e+18));
    offeredShares.push(new BigNumber(7e+18));

    var correctPriceToBeReceived = [];
    correctPriceToBeReceived.push(new BigNumber(2e+18));
    correctPriceToBeReceived.push(new BigNumber(1e+18));
    correctPriceToBeReceived.push(new BigNumber(7e+18));

    contract.totalSupply().then((result) => {
      assert.strictEqual(result.toNumber(), 0);
      // ROUND 1 EXACT
      return contract.createShares(wantedShares[0], {from: OWNER, value: investFunds[0].toNumber()});
    }).then((result) => {
      // Check totalSupply
      return contract.totalSupply();
    }).then((result) => {
      assert.strictEqual(result.toNumber(), wantedShares[0].toNumber());
    }).then((result) => {
      // Check sumInvested
      return contract.sumInvested();
    }).then((result) => {
      // TODO: calculate sumInvested via Smart Contract
      assert.strictEqual(result.toNumber(), investFunds[0].toNumber());
      return etherTokenContract.balanceOf(contract.address);
    }).then((result) => {
      console.log(result.toNumber());
    }).then((result) => {
      // ROUND 2 0VERPAID
      return contract.createShares(wantedShares[1], {from: accounts[1], value: investFunds[1].toNumber()});
    }).then((result) => {
      // Check totalSupply
      return contract.totalSupply();
    }).then((result) => {
      assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
    }).then((result) => {
      // Check sumInvested
      return contract.sumInvested();
    }).then((result) => {
      // TODO: calculate sumInvested via Smart Contract
      assert.strictEqual(result.toNumber(), correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());
    }).then((result) => {

      // ROUND 3 MANAGING
      return contract.buy(buy[0].id, buy[0].buy_how_much, { from: OWNER });
    }).then((result) => {
      return bitcoinTokenContract.balanceOf(contract.address);
    }).then((result) => {
      console.log('Total Token Supply: ' + result.toNumber());

      // ROUND 3
      return contract.createShares(wantedShares[2], { from: accounts[2], value: investFunds[2].toNumber() });
    }).then((result) => {
      // Check totalSupply
      return contract.totalSupply();
    }).then((result) => {
      // Paid to little, hence no shares received
      assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
    }).then((result) => {
      // Check sumInvested
      return contract.sumInvested();
    }).then((result) => {
      // Paid to little, hence no investment made
      assert.strictEqual(result.toNumber(), correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());

    }).then(done).catch(done);
  });

});
