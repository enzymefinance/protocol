const BigNumber = require('bignumber.js');

// Tokens

// Constants as defined in the token contracts
const PREMINED_AMOUNT = new BigNumber(Math.pow(10, 18));
const ETHERTOKEN_DECIMALS = 18;
const BITCOINTOKEN_DECIMALS = 8;
const REPTOKEN_DECIMALS = 8;
const EUROTOKEN_DECIMALS = 8;

// Price Feed

// Exchange

const EXCHANGE_ADDRESS = '0x50396a51a81b938ccb2d1466de9eebc49d5564f5'

// Solidity constants
const ether = new BigNumber(Math.pow(10, 18));

module.exports = {
  PREMINED_AMOUNT,
  ETHERTOKEN_DECIMALS,
  BITCOINTOKEN_DECIMALS,
  REPTOKEN_DECIMALS,
  EUROTOKEN_DECIMALS,
  EXCHANGE_ADDRESS,
  ether,
};
