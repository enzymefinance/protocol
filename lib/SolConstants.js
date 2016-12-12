const BigNumber = require('bignumber.js');


// Router
export const INITIAL_FEE = 0;

// Tokens
const PREMINED_PRECISION = 8;
export const PREMINED_AMOUNT = new BigNumber(10 ** 10);
export const BITCOINTOKEN_ATOMIZE = new BigNumber(10 ** PREMINED_PRECISION);
export const DOLLARTOKEN_ATOMIZE = new BigNumber(10 ** PREMINED_PRECISION);
export const EUROTOKEN_ATOMIZE = new BigNumber(10 ** PREMINED_PRECISION);
