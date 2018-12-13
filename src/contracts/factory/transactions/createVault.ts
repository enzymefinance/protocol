import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

export const createVault = transactionFactory(
  'createVault',
  Contracts.FundFactory,
  undefined,
  undefined,
  undefined,
  // { amguPayable: true },
);

