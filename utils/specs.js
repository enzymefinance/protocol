const constants = require('./constants.js');

// Tokens

exports.getTokenDecimalsByAddress = (address) => {
  if (address === EtherToken.deployed().then(deployed => deployed.address)) return constants.ETHERTOKEN_DECIMALS;
  if (address === BitcoinToken.deployed().then(deployed => deployed.address)) return constants.BITCOINTOKEN_DECIMALS;
  if (address === RepToken.deployed().then(deployed => deployed.address)) return constants.REPTOKEN_DECIMALS;
  if (address === EuroToken.deployed().then(deployed => deployed.address)) return constants.EUROTOKEN_DECIMALS;
  return false;
};

exports.getTokenSymbolByAddress = (address) => {
  if (address === EtherToken.deployed().then(deployed => deployed.address)) return 'ETH-T';
  if (address === BitcoinToken.deployed().then(deployed => deployed.address)) return 'BTC-T';
  if (address === RepToken.deployed().then(deployed => deployed.address)) return 'REP';
  if (address === EuroToken.deployed().then(deployed => deployed.address)) return 'EUR-T';
  return false;
};

exports.getTokenAddress = (symbol) => {
  if (symbol === 'ETH-T') return EtherToken.deployed().then(deployed => deployed.address);
  if (symbol === 'BTC-T') return BitcoinToken.deployed().symbol;
  if (symbol === 'REP') return RepToken.deployed().symbol;
  if (symbol === 'EUR-T') return EuroToken.deployed().symbol;
  return false;
};


exports.getQuoteTokens = () => ['ETH-T'];

exports.getBaseTokens = () => ['BTC-T', 'REP', 'EUR-T'];

exports.getTokens = () => ['ETH-T', 'BTC-T', 'REP', 'EUR-T'];

exports.getTokenByAddress = address => _.invert(tokens.ropsten)[address];
