const BigNumber = require('bignumber.js');

// Calculate Price as stored in Solidity
exports.calcSolPrice = (newPrice, precision) => {
  /* Note:
   *  This calculaion is not exact.
   *  Error sources are:
   *    Math.floor and
   *    Finite amount of decimals (precision)
   */
  const power = 18 - precision;
  const divisor = `1e+${power}`;
  return Math.floor(newPrice.dividedBy(new BigNumber(divisor)).toNumber());
};
