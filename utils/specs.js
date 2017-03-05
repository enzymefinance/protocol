const constants = require('./constants.js');

const EtherToken = artifacts.require("./EtherToken.sol");
const BitcoinToken = artifacts.require("./BitcoinToken.sol");
const RepToken = artifacts.require("./RepToken.sol");
const EuroToken = artifacts.require("./EuroToken.sol");


function getTokenSpecs() {
  return {
    'ETH-T': {
      address: '0x016557c51a54aff68a6c4a06a895a3e89ed4cc63',
      decimals: constants.ETHERTOKEN_DECIMALS,
    },
    'BTC-T': {
      address: '0x71f9cd6ad66d319a94ffd5b538fd4c8aafe6fa6f',
      decimals: constants.BITCOINTOKEN_DECIMALS,
    },
    'REP': {
      address: '0xdc567937862159c5767284ce20445129f8d9dddb',
      decimals: constants.REPTOKEN_DECIMALS,
    },
    'EUR-T': {
      address: '0x2f66c32f89f28bfbd60a85d481b3c9eaf2fb2e90',
      decimals: constants.EUROTOKEN_DECIMALS,
    },
  };
}

function getTokenDecimalsByAddress(address) {
  console.log(getTokenSpecs())
  // for (let i = 0; i < 4) {
  //
  // }
  // if (address === EtherToken.deployed().then(deployed => deployed.address)) return constants.ETHERTOKEN_DECIMALS;
  // if (address === BitcoinToken.deployed().then(deployed => deployed.address)) return constants.BITCOINTOKEN_DECIMALS;
  // if (address === RepToken.deployed().then(deployed => deployed.address)) return constants.REPTOKEN_DECIMALS;
  // if (address === EuroToken.deployed().then(deployed => deployed.address)) return constants.EUROTOKEN_DECIMALS;
  // return false;
}

function getTokenSymbolByAddress(address) {
  if (address === EtherToken.deployed().then(deployed => deployed.address)) return 'ETH-T';
  if (address === BitcoinToken.deployed().then(deployed => deployed.address)) return 'BTC-T';
  if (address === RepToken.deployed().then(deployed => deployed.address)) return 'REP';
  if (address === EuroToken.deployed().then(deployed => deployed.address)) return 'EUR-T';
  return false;
}

function getTokenAddressBySymbol(symbol) {
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
  getTokenAddressBySymbol,
};
