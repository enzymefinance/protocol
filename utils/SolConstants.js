const BigNumber = require('bignumber.js');

// Router
export const INITIAL_FEE = 0;

// Tokens
// Constants as defined in the token contracts
const ETHER_PRECISION = 18;
const ETHERTOKEN_PRECISION = 18;
const BITCOINTOKEN_PRECISION = 8;
const DOLLARTOKEN_PRECISION = 8;
const EUROTOKEN_PRECISION = 8;
export const PREMINED_AMOUNT = new BigNumber(Math.pow(10, 10));

// Price Feed
// To get to the smallest possible unit of these Tokens, multiply w the ATOMIZE factor
export const ETHER_ATOMIZE = new BigNumber(Math.pow(10, ETHER_PRECISION));
export const ETHERTOKEN_ATOMIZE = new BigNumber(Math.pow(10, ETHERTOKEN_PRECISION));
export const BITCOINTOKEN_ATOMIZE = new BigNumber(Math.pow(10, BITCOINTOKEN_PRECISION));
export const DOLLARTOKEN_ATOMIZE = new BigNumber(Math.pow(10, DOLLARTOKEN_PRECISION));
export const EUROTOKEN_ATOMIZE = new BigNumber(Math.pow(10, EUROTOKEN_PRECISION));

// Exchange
