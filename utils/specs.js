const constants = require('./constants.js');

const EtherToken = artifacts.require("./EtherToken.sol");
const BitcoinToken = artifacts.require("./BitcoinToken.sol");
const RepToken = artifacts.require("./RepToken.sol");
const EuroToken = artifacts.require("./EuroToken.sol");

// Tokens

function getTokenDecimalsByAddress(address) {
  if (address === EtherToken.deployed().then(deployed => deployed.address)) return constants.ETHERTOKEN_DECIMALS;
  if (address === BitcoinToken.deployed().then(deployed => deployed.address)) return constants.BITCOINTOKEN_DECIMALS;
  if (address === RepToken.deployed().then(deployed => deployed.address)) return constants.REPTOKEN_DECIMALS;
  if (address === EuroToken.deployed().then(deployed => deployed.address)) return constants.EUROTOKEN_DECIMALS;
  return false;
}

function getTokenSymbolByAddress(address) {
  if (address === EtherToken.deployed().then(deployed => deployed.address)) return 'ETH-T';
  if (address === BitcoinToken.deployed().then(deployed => deployed.address)) return 'BTC-T';
  if (address === RepToken.deployed().then(deployed => deployed.address)) return 'REP';
  if (address === EuroToken.deployed().then(deployed => deployed.address)) return 'EUR-T';
  return false;
}

function getTokenAddress(symbol) {
  if (symbol === 'ETH-T') return EtherToken.deployed().then(deployed => deployed.address);
  if (symbol === 'BTC-T') return BitcoinToken.deployed().symbol;
  if (symbol === 'REP') return RepToken.deployed().symbol;
  if (symbol === 'EUR-T') return EuroToken.deployed().symbol;
  return false;
}


function getQuoteTokens() { ['ETH-T'] };

function getBaseTokens() { ['BTC-T', 'REP', 'EUR-T'] };

function getTokens() { ['ETH-T', 'BTC-T', 'REP', 'EUR-T'] };

function getTokenByAddress(address) { _.invert(tokens.ropsten)[address] };


module.exports = {
  getTokenDecimalsByAddress,
  getTokenSymbolByAddress,
  getTokenAddress,
};
