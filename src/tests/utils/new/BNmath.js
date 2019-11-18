import { BN } from 'web3-utils';

export const BNExpDiv = (BN1, BN2, exp = 18) =>
  BN1.mul(new BN(10).pow(new BN(exp))).div(BN2)

export const BNExpMul = (BN1, BN2, exp = 18) =>
  BN1.mul(BN2).div(new BN(10).pow(new BN(exp)))

export const BNExpInverse = (BN1, exp = 18) =>
  new BN(10).pow(new BN(exp)).pow(new BN(2)).div(BN1)
