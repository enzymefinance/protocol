import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

export const createTrading = transactionFactory(
  'createTrading',
  Contracts.FundFactory,
  undefined,
  undefined,
  undefined,
  // { amguPayable: true },
);

