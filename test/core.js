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
});
