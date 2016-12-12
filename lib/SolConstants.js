const BigNumber = require('bignumber.js');


// Router
export const INITIAL_FEE = 0;

// Tokens
const PREMINED_PRECISION = 8;
const PREMINED_OUTSTANDING_PRECISION = 18 - PREMINED_PRECISION;
export const PREMINED_AMOUNT = new BigNumber(Math.pow(10, 10));
export const BITCOINTOKEN_ATOMIZE = new BigNumber(Math.pow(10, PREMINED_PRECISION));
export const DOLLARTOKEN_ATOMIZE = new BigNumber(Math.pow(10, PREMINED_PRECISION));
export const EUROTOKEN_ATOMIZE = new BigNumber(Math.pow(10, PREMINED_PRECISION));

export const BITCOINTOKEN_OUTSTANDING_PRECISION = new BigNumber(Math.pow(10, PREMINED_OUTSTANDING_PRECISION));
export const DOLLARTOKEN_OUTSTANDING_PRECISION = new BigNumber(Math.pow(10, PREMINED_OUTSTANDING_PRECISION));
export const EUROTOKEN_OUTSTANDING_PRECISION = new BigNumber(Math.pow(10, PREMINED_OUTSTANDING_PRECISION));
