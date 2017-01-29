const BigNumber = require('bignumber.js');

// Router
exports.INITIAL_FEE = 0;

// Tokens
// Constants as defined in the token contracts
exports.PREMINED_AMOUNT = new BigNumber(Math.pow(10, 18));
exports.ETHERTOKEN_PRECISION = 18;
exports.BITCOINTOKEN_PRECISION = 8;
exports.REPTOKEN_PRECISION = 8;
exports.EUROTOKEN_PRECISION = 8;

// Price Feed

// Exchange

// Solidity constants
exports.ether = new BigNumber(Math.pow(10, 18));
