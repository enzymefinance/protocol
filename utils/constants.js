const BigNumber = require('bignumber.js');

// Router
exports.INITIAL_FEE = 0;

// Tokens
// Constants as defined in the token contracts
const ETHER_PRECISION = 18;
const ETHERTOKEN_PRECISION = 18;
const BITCOINTOKEN_PRECISION = 8;
const DOLLARTOKEN_PRECISION = 8;
const EUROTOKEN_PRECISION = 8;
exports.PREMINED_AMOUNT = new BigNumber(Math.pow(10, 10));

// Price Feed
// To get to the smallest possible unit of these Tokens, multiply w the ATOMIZE factor
exports.ETHER_ATOMIZE = new BigNumber(Math.pow(10, ETHER_PRECISION));
exports.ETHERTOKEN_ATOMIZE = new BigNumber(Math.pow(10, ETHERTOKEN_PRECISION));
exports.BITCOINTOKEN_ATOMIZE = new BigNumber(Math.pow(10, BITCOINTOKEN_PRECISION));
exports.DOLLARTOKEN_ATOMIZE = new BigNumber(Math.pow(10, DOLLARTOKEN_PRECISION));
exports.EUROTOKEN_ATOMIZE = new BigNumber(Math.pow(10, EUROTOKEN_PRECISION));

// Exchange

// Solidity constants
exports.ether = new BigNumber(Math.pow(10, 18));
