var BigNumber = require('bignumber.js');


exports.initToken = function(tokenProtocolInstances, tokenParameters) {
  tokenParameters.forEach((tokenParameter) => {
    it('Initialize ' + tokenParameter.tokenName, (done) => {
      Token.new(
      ).then((instance) => {
        // Address of the Token
        tokenProtocolInstances.push(TokenProtocol.at(instance.address));
      }).then(done).catch(done);
    });
  });
};

exports.initPriceFeed = function(priceFeedProtocolInstances, priceFeedParameters) {
  priceFeedParameters.forEach((priceFeedParameter) => {
    it('Initialize ' + priceFeedParameter.priceFeedName, (done) => {
      PriceFeed.new(
      ).then((instance) => {
        // Address of the PriceFeed
        priceFeedProtocolInstances.push(PriceFeedProtocol.at(instance.address));
      }).then(done).catch(done);
    });
  });
};

exports.initExchange = function(exchangeProtocolInstances, exchangeParameters) {
  exchangeParameters.forEach((exchangeParameter) => {
    it('Initialize ' + exchangeParameter.exchangeName, (done) => {
      Exchange.new(
      ).then((instance) => {
        // Address of the Exchange
        exchangeProtocolInstances.push(Exchange.at(instance.address));
      }).then(done).catch(done);
    });
  });
};


exports.initRegistrar = function(register, registerParameters) {
  registerParameters.forEach((registerParameter) => {
    it('Initialize new Registrar Contract', (done) => {
      Registrar.new(
        registerParameter.tokenAddresses,
        registerParameter.priceFeedAddresses,
        registerParameter.exchangeAddresses
      ).then((instance) => {
        /*TODO use registerProtocol instead*/
        register.push(Registrar.at(instance.address));
        // // Rem.:
        // //  Using protocol contract to access underlying functions
        // //  This ensures compatibility of function calls within HS.
        // registerProtocol = RegistrarProtocol.at(instance.address);
      }).then(done).catch(done);
    });
  });
};

/// Calculate Price as stored in Solidity
function calcSolPrice(newPrice, precision) {
  /* Note:
   *  This calculaion is not exact.
   *  Error sources are:
   *    Math.floor and
   *    Finite amount of decimals (precision)
   */
  const power = 18 - precision;
  const divisor = "1e+" + power;
  return Math.floor(newPrice.dividedBy(new BigNumber(divisor)).toNumber())
}

/*TODO incomplete*/
function setPrice(priceFeeds, newPrice) {
  it('Set Price Feed at ' + ' to: ' + newPrice.toNumber(), (done) => {
    var priceFeed = priceFeeds[0];
    var precision;
    // console.log(priceFeed);
    // return priceFeedUST.setPrice(UST.address, newPrice.toNumber(), {from: accounts[0]});
    /*TODO setPrices -> setPrice; careful w priceTickerProtocol! */
    priceFeed.setPrice(priceFeed.address, newPrice, {from: web3.eth.accounts[0]}).then((result) => {
      return priceFeed.precision();
    }).then((result) => {
      precision = result;
      return priceFeed.getPrice(priceFeed.address, {from: web3.eth.accounts[1]});
    }).then((result) => {
      console.log(result);
      assert.strictEqual(result.toNumber(), calcSolPrice(newPrice, precision), 'set and get price not equal');
    }).then(done).catch(done);
  });
};
