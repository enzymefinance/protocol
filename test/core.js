/* eslint-env mocha */
var BigNumber = require('bignumber.js');
var Accounts = require('../lib/accounts.js');

contract('Core', (accounts) => {
  // Check Balances
  const balanceReq = new BigNumber(10e+18);
  const numAccounts = 3;
  var balances = Accounts.checkBalance(balanceReq, numAccounts);

  // INITIALIZE FIELDS
  var tokenProtocolInstances = [];
  var priceFeedProtocolInstances = [];
  var exchangeProtocolInstance;
  var registrarProtocolInstance;
  var coreProtocolInstance;

  // INITIALIZE PARAMETERS
  // Initialize Token
  const tokenParameters = [
    {
      tokenName: 'Token of USD',
      tokenSymbol: 'UST',
      precision: 8,
      commission: 20,
    },
  ];
  // Initialize PriceFeed
  const priceFeedParameters = [
    {
      priceFeedName: 'PriceFeed of USD',
      priceFeedSymbol: 'UST',
      precision: 8,
      commission: 20,
    },
  ];
  // Initialize Exchange
  const exchangeParameters = [
    {
      exchangeName: 'Exchange of USD',
      exchangeSymbol: 'UST',
      precision: 8,
      commission: 20,
    },
  ];

  // INITIALIZE STATE
  describe('Initialize State', function() {
    tokenParameters.forEach((tokenParameter) => {
      it('Initialize ' + tokenParameter.tokenName, (done) => {
        Token.new(
        ).then((instance) => {
          // Address of Token
          tokenProtocolInstances.push(TokenProtocol.at(instance.address));
        }).then(done).catch(done);
      });
    });
    priceFeedParameters.forEach((priceFeedParameter) => {
      it('Initialize ' + priceFeedParameter.priceFeedName, (done) => {
        PriceFeed.new(
        ).then((instance) => {
          // Address of PriceFeed
          priceFeedProtocolInstances.push(PriceFeedProtocol.at(instance.address));
        }).then(done).catch(done);
      });
    });

    it('Initialize Exchange', (done) => {
      Exchange.new(
      ).then((instance) => {
        // Address of Exchange
        // TODO use exchangeProtocol instead
        exchangeProtocolInstance = Exchange.at(instance.address);
      }).then(done).catch(done);
    });

    // TODO input via parameter
    it('Initialize new Registrar Contract', (done) => {
      Registrar.new(
        [tokenProtocolInstances[0].address],
        [priceFeedProtocolInstances[0].address],
        [exchangeProtocolInstance.address]
      ).then((instance) => {
        // Address of Registrar
        // TODO use registrarProtocol instead
        registrarProtocolInstance = Registrar.at(instance.address);
      }).then(done).catch(done);
    });

    it('Initialize Core', (done) => {
      Core.new(
        registrarProtocolInstance.address,
        '0x0',
        '0x0',
        0
      ).then((instance) => {
        // Address of Core
        // TODO use registrarProtocol instead
        coreProtocolInstance = Core.at(instance.address);
      }).then(done).catch(done);
    });
  });



  // MAIN TESTING
  describe('Main Testing', function() {

    it('addresses', (done) => {
      console.log(tokenProtocolInstances[0].address);
      console.log(priceFeedProtocolInstances[0].address);
      console.log(registrarProtocolInstance.address);
      console.log(exchangeProtocolInstance.address);
      console.log(coreProtocolInstance.address);
      done();
    });

    it("Create and Annihilate Shares by investing and withdrawing in a portfolio and calculate Performance",(done) => {
      // Investment Round 1 by Account 1
      //  Parameters
      // Set Prices
      var priceGraph = [];
      // Price in Wei/Asset
      priceGraph.push(new BigNumber(9.0909091e+16)); // 1 ETH = 11 USD
      priceGraph.push(new BigNumber(1e+17)); // 1 ETH = 10 USD
      priceGraph.push(new BigNumber(8.3333333e+16)); // 1 ETH = 12 USD
      priceFeedProtocolInstances[0].setPrice(priceFeeds, priceGraph[0]);
      
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

      // Subtract investment amount
      balances[0] = balances[0].minus(correctPriceToBePaid[0]);
      balances[1] = balances[1].minus(correctPriceToBePaid[1]);
      balances[2] = balances[2].minus(correctPriceToBePaid[2]);

      // Add withdrawal amount
      balances[0] = balances[0].add(correctPriceToBeReceived[0]);
      balances[1] = balances[1].add(correctPriceToBeReceived[1]);
      balances[2] = balances[2].add(correctPriceToBeReceived[2]);

      coreProtocolInstance.totalSupply().then((result) => {
        assert.strictEqual(result.toNumber(), 0);
        // ROUND 1
        return coreProtocolInstance.createShares(wantedShares[0], {from: accounts[0], value: investFunds[0].toString()});
      }).then(function(result) {
        // Check totalSupply
        return coreProtocolInstance.totalSupply();
      }).then(function(result) {
        assert.strictEqual(result.toNumber(), wantedShares[0].toNumber());
      }).then(function(result) {
        // Check sumInvested
        return coreProtocolInstance.sumInvested();
      }).then(function(result) {
        // TODO: calculate sumInvested via Smart Contract
        assert.strictEqual(result.toNumber(), investFunds[0].toNumber());
      }).then(function(result) {
        // ROUND 2
        return coreProtocolInstance.createShares(wantedShares[1], {from: accounts[1], value: investFunds[1].toString()});
      }).then(function(result) {
        // Check totalSupply
        return coreProtocolInstance.totalSupply();
      }).then(function(result) {
        assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
      }).then(function(result) {
        // Check sumInvested
        return coreProtocolInstance.sumInvested();
      }).then(function(result) {
        // TODO: calculate sumInvested via Smart Contract
        assert.strictEqual(result.toNumber(), correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());
      }).then(function(result) {
        // ROUND 3 MANAGING
        return coreProtocolInstance.buy(tokenProtocolInstances[0].address, buyUST[0], {from: accounts[1]});
      }).then(function(result) {
        return UST.totalSupply()
      }).then(function(result) {
        console.log('Total Token Supply: ' + result.toNumber());
        console.log('Total Token Bought: ' + buyUST[0].dividedBy(priceGraph[0]).toNumber());
      }).then(function(result) {
        // Price changes
        return UST.setPrices(priceGraph[1], {from: accounts[0]});
      }).then(function(result) {

        // ROUND 3
        return coreProtocolInstance.createShares(wantedShares[2], {from: accounts[2], value: investFunds[2].toString()});
      }).then(function(result) {
        // Check totalSupply
        return coreProtocolInstance.totalSupply();
      }).then(function(result) {
        // Paid to little, hence no shares received
        assert.strictEqual(result.toNumber(), wantedShares[0].add(wantedShares[1]).toNumber());
      }).then(function(result) {
        // Check sumInvested
        return coreProtocolInstance.sumInvested();
      }).then(function(result) {
        // Paid to little, hence no investment made
        assert.strictEqual(result.toNumber(), correctPriceToBePaid[0].add(correctPriceToBePaid[1]).toNumber());
        // ROUND 4 Withdrawal
        return coreProtocolInstance.annihilateShares(offeredShares[0], withdrawFunds[0], {from: accounts[0]});
      }).then(function(result) {
        // Check totalSupply
        return coreProtocolInstance.totalSupply();
      }).then(function(result) {
        var balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).toNumber();
        assert.strictEqual(result.toNumber(), balance);
      }).then(function(result) {
        // Check sumInvested
        return coreProtocolInstance.sumWithdrawn();
      }).then(function(result) {
        // TODO: calculate outside w commission etc.
        console.log('Sold shares: ' + offeredShares[0]);
        console.log('Funds received: ' + result.toNumber());
        // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].toNumber());
      }).then(function(result) {
        // ROUND 5
        return coreProtocolInstance.annihilateShares(offeredShares[1], withdrawFunds[1], {from: accounts[1]});
      }).then(function(result) {
        // Check totalSupply
        return coreProtocolInstance.totalSupply();
      }).then(function(result) {
        var balance = wantedShares[0].add(wantedShares[1]).minus(offeredShares[0]).minus(offeredShares[1]).toNumber();
        assert.strictEqual(result.toNumber(), balance);
      }).then(function(result) {
        // Check sumInvested
        return coreProtocolInstance.sumWithdrawn();
      }).then(function(result) {
        // TODO: calculate outside w commission etc.
        console.log('Sold shares: ' + offeredShares[1]);
        console.log('Funds received (total): ' + result.toNumber());
        // assert.strictEqual(result.toNumber(), correctPriceToBeReceived[0].add(correctPriceToBeReceived[1]).toNumber());
      }).then(function(result) {
        // TODO: calculate outside w commission, performance gains, loses etc.
        // for (i = 0; i < numAccounts; ++i) {
        //   // Actual Balance
        //   var balance = web3.eth.getBalance(web3.eth.accounts[i],'ether');
        //   // >=, since actual balance has a gas cost for sending the tx.
        //   // TODO: Estimate Gas cost
        //   console.log(' Gas cost of Account ' + i + ':', balances[i].minus(balance).dividedBy('10e+18').toString());
        //   assert.isTrue(balances[i].greaterThanOrEqualTo(balance), "One of the Accounts has wrong balance!")
        // };

        // coreProtocolInstance({value: "1"});
      }).then(done).catch(done);
    });
  });
});
