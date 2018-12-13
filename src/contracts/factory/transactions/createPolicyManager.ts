import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

export const createPolicyManager = transactionFactory(
  'createPolicyManager',
  Contracts.FundFactory,
  undefined,
  undefined,
  undefined,
  // { amguPayable: true },
);

