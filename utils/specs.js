const constants = require('./constants.js');

// Tokens

exports.getTokenPrecisionByAddress = (address) => {
  if (address === EtherToken.deployed().address) return constants.ETHERTOKEN_PRECISION;
  if (address === BitcoinToken.deployed().address) return constants.BITCOINTOKEN_PRECISION;
  if (address === RepToken.deployed().address) return constants.REPTOKEN_PRECISION;
  if (address === EuroToken.deployed().address) return constants.EUROTOKEN_PRECISION;
  return false;
};

exports.getTokenSymbolByAddress = (address) => {
  if (address === EtherToken.deployed().address) return 'ETH-T';
  if (address === BitcoinToken.deployed().address) return 'BTC-T';
  if (address === RepToken.deployed().address) return 'REP';
  if (address === EuroToken.deployed().address) return 'EUR-T';
  return false;
};

exports.getQuoteTokens = () => ['ETH-T'];

exports.getBaseTokens = () => ['BTC-T', 'REP', 'EUR-T'];

exports.getTokens = () => ['ETH-T', 'BTC-T', 'REP', 'EUR-T'];

exports.getTokenByAddress = address => _.invert(tokens.ropsten)[address];
