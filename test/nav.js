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
    registrarContract;
  let testCases;

  before('Check accounts', (done) => {
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
      done();
    });
  });

  it('Deploy smart contract', (done) => {
    Core.new(etherTokenContract.address, registrarContract.address).then((result) => {
      contract = result;
      return contract.sumInvested();
    }).then((result) => {
      assert.equal(result.toNumber(), 0);
      done();
    });
  });

  // MAIN TESTING

  // Set Prices
  var priceGraph = [];
  // Price in Wei/Asset
  priceGraph.push(new BigNumber(9.0909091e+16)); // 1 ETH = 11 USD
  priceGraph.push(new BigNumber(1e+17)); // 1 ETH = 10 USD
  priceGraph.push(new BigNumber(8.3333333e+16)); // 1 ETH = 12 USD
  // Accounts.setPrice(priceFeeds, priceGraph[0]);

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

    /* Buying
     *  Round 1:
     */
    var buyUST = [];
    buyUST.push(new BigNumber(1e+18));

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

    // // Subtract investment amount
    // balances[0] = balances[0].minus(correctPriceToBePaid[0]);
    // balances[1] = balances[1].minus(correctPriceToBePaid[1]);
    // balances[2] = balances[2].minus(correctPriceToBePaid[2]);
    //
    // // Add withdrawal amount
    // balances[0] = balances[0].add(correctPriceToBeReceived[0]);
    // balances[1] = balances[1].add(correctPriceToBeReceived[1]);
    // balances[2] = balances[2].add(correctPriceToBeReceived[2]);


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
    //   return contract.buy(tokenUST.address, buyUST[0], {from: accounts[1]});
    // }).then((result) => {
    //   return UST.totalSupply()
    // }).then((result) => {
    //   console.log('Total Token Supply: ' + result.toNumber());
    //   console.log('Total Token Bought: ' + buyUST[0].dividedBy(priceGraph[0]).toNumber());
    // }).then((result) => {
    //   // Price changes
    //   return UST.setPrices(priceGraph[1], {from: OWNER});
    // }).then((result) => {
    //
      // ROUND 3
      return contract.createShares(wantedShares[2], {from: accounts[2], value: investFunds[2].toNumber()});
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
      // ROUND 4 Withdrawal
    //   return contract.annihilateShares(offeredShares[0], withdrawFunds[0], {from: OWNER});
    // }).then((result) => {
    //   // Check totalSupply
    //   return contract.totalSupply();
    // }).then((result) => {
    //   var balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
    //   assert.strictEqual(result.toNumber(), balance);
    // }).then((result) => {
    //   // Check sumInvested
    //   return contract.sumWithdrawn();
    // }).then((result) => {
    //   // TODO: calculate outside w commission etc.
    //   console.log('Sold shares: ' + offeredShares[0]);
    //   console.log('Funds received: ' + result.toNumber());
    //   // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].toNumber());
    // }).then((result) => {
    //   // ROUND 5
    //   return contract.annihilateShares(offeredShares[1], withdrawFunds[1], {from: accounts[1]});
    // }).then((result) => {
    //   // Check totalSupply
    //   return contract.totalSupply();
    // }).then((result) => {
    //   var balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).minus(offeredShares[1]).toNumber();
    //   assert.strictEqual(result.toNumber(), balance);
    // }).then((result) => {
    //   // Check sumInvested
    //   return contract.sumWithdrawn();
    // }).then((result) => {
    //   // TODO: calculate outside w commission etc.
    //   console.log('Sold shares: ' + offeredShares[1]);
    //   console.log('Funds received (total): ' + result.toNumber());
    //   // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].add(correctPriceToBeReceived[1]).toNumber());
    // }).then((result) => {
    //   // TODO: calculate outside w commission, performance gains, loses etc.
    //   // for (i = 0; i < numAccounts; ++i) {
    //   //   // Actual Balance
    //   //   var balance = web3.eth.getBalance(web3.eth.accounts[i],'ether');
    //   //   // >=, since actual balance has a gas cost for sending the tx.
    //   //   // TODO: Estimate Gas cost
    //   //   console.log(' Gas cost of Account ' + i + ':', balances[i].minus(balance).dividedBy('10e+18').toNumber());
    //   //   assert.isTrue(balances[i].greaterThanOrEqualTo(balance), "One of the Accounts has wrong balance!")
    //   // };
    //
    //   // contract({value: "1"});
    }).then(done).catch(done);
  });

});
