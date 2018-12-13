import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

export const createFeeManager = transactionFactory(
  'createFeeManager',
  Contracts.FundFactory,
  undefined,
  undefined,
  undefined,
  // { amguPayable: true },
);

