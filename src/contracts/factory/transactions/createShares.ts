import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

export const createShares = transactionFactory(
  'createShares',
  Contracts.FundFactory,
  undefined,
  undefined,
  undefined,
  // { amguPayable: true },
);

