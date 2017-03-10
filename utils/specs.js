const constants = require('./constants.js');

const EtherToken = artifacts.require("./EtherToken.sol");
const BitcoinToken = artifacts.require("./BitcoinToken.sol");
const RepToken = artifacts.require("./RepToken.sol");
const EuroToken = artifacts.require("./EuroToken.sol");

const network = 'kovan';

const tokens = {
  kovan: {
    'ETH-T': '0x016557c51a54aff68a6c4a06a895a3e89ed4cc63',
    'BTC-T': '0x71f9cd6ad66d319a94ffd5b538fd4c8aafe6fa6f',
    'REP-T': '0xdc567937862159c5767284ce20445129f8d9dddb',
    'EUR-T': '0x2f66c32f89f28bfbd60a85d481b3c9eaf2fb2e90',
  },
  ropsten: {
    'W-ETH': '0xece9fa304cc965b00afc186f5d0281a00d3dbbfd',
    DAI: '0x0000000000000000000000000000000000000000',
    MKR: '0xa7f6c9a5052a08a14ff0e3349094b6efbc591ea4',
    DGD: '0x1ab3bd2e2670d6e00ca406217e4d327f7f946d7e',
    GNT: '0x7fb3c4ff78bd0305a6ec436eda79303f981c5938',
    'W-GNT': '0xa5d92f318247c3b43241436dbb55ec4be600dc42',
    REP: '0xf75caa57375a75dfc1a7ea917d6abb2c95511053',
    ICN: '0x5b73d26807ea72287bafa1a27fccf8ece5deabc4',
    '1ST': '0xa8c784efdfe7d48bc5df28f770b6454a037e2abe',
    SNGLS: '0xf48cf5ad04afa369fe1ae599a8f3699c712b0352',
    VSL: '0x5017f42cf680fcbcab1093263468745c9af63e35',
    PLU: '0xcfe185ce294b443c16dd89f00527d8b25c45bf9d',
    MLN: '0xd4a8f8293d639752e263be3869057eaf7536e005',
  },
  morden: {
    'W-ETH': '0x52fe88b987c7829e5d5a61c98f67c9c14e6a7a90',
    DAI: '0xa6581e37bb19afddd5c11f1d4e5fb16b359eb9fc',
    MKR: '0xffb1c99b389ba527a9194b1606b3565a07da3eef',
    DGD: '0x3c6f5633b30aa3817fa50b17e5bd30fb49bddd95',
    GNT: '0x0000000000000000000000000000000000000000',
    'W-GNT': '0x0000000000000000000000000000000000000000',
    REP: '0x0000000000000000000000000000000000000000',
    ICN: '0x0000000000000000000000000000000000000000',
    '1ST': '0x0000000000000000000000000000000000000000',
    SNGLS: '0x0000000000000000000000000000000000000000',
    VSL: '0x0000000000000000000000000000000000000000',
    PLU: '0x0000000000000000000000000000000000000000',
    MLN: '0x0000000000000000000000000000000000000000',
  },
  live: {
    'W-ETH': '0xecf8f87f810ecf450940c9f60066b4a7a501d6a7',
    DAI: '0x0000000000000000000000000000000000000000',
    MKR: '0xc66ea802717bfb9833400264dd12c2bceaa34a6d',
    DGD: '0xe0b7927c4af23765cb51314a0e0521a9645f0e2a',
    GNT: '0xa74476443119a942de498590fe1f2454d7d4ac0d',
    'W-GNT': '0x01afc37f4f85babc47c0e2d0eababc7fb49793c8',
    REP: '0x48c80f1f4d53d5951e5d5438b54cba84f29f32a5',
    ICN: '0x888666ca69e0f178ded6d75b5726cee99a87d698',
    '1ST': '0xaf30d2a7e90d7dc361c8c4585e9bb7d2f6f15bc7',
    SNGLS: '0xaec2e87e0a235266d9c5adc9deb4b2e29b54d009',
    VSL: '0x5c543e7ae0a1104f78406c340e9c64fd9fce5170',
    PLU: '0xd8912c10681d8b21fd3742244f44658dba12264e',
    MLN: '0xbeb9ef514a379b997e0798fdcc901ee474b6d9a1',
  },
};

// http://numeraljs.com/ for formats
const tokenSpecs = {
  // Melonport
  'ETH-T': { precision: constants.ETHERTOKEN_DECIMALS, format: '0,0.00[0000000000000000]' },
  'BTC-T': { precision: constants.BITCOINTOKEN_DECIMALS, format: '0,0.00[0000000000000000]' },
  'REP-T': { precision: constants.REPTOKEN_DECIMALS, format: '0,0.00[0000000000000000]' },
  'EUR-T': { precision: constants.EUROTOKEN_DECIMALS, format: '0,0.00[0000000000000000]' },
  // Maker
  'W-ETH': { precision: 18, format: '0,0.00[0000000000000000]' },
  DAI: { precision: 18, format: '0,0.00[0000000000000000]' },
  MKR: { precision: 18, format: '0,0.00[0000000000000000]' },
  DGD: { precision: 9, format: '0,0.00[0000000]' },
  GNT: { precision: 18, format: '0,0.00[0000000000000000]' },
  'W-GNT': { precision: 18, format: '0,0.00[0000000000000000]' },
  REP: { precision: 18, format: '0,0.00[0000000000000000]' },
  ICN: { precision: 18, format: '0,0.00[0000000000000000]' },
  '1ST': { precision: 18, format: '0,0.00[0000000000000000]' },
  SNGLS: { precision: 0, format: '0,0' },
  VSL: { precision: 18, format: '0,0.00[0000000000000000]' },
  PLU: { precision: 18, format: '0,0.00[0000000000000000]' },
  MLN: { precision: 18, format: '0,0.00[0000000000000000]' },
};

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
