import { transactionFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

export const continueCreation = transactionFactory(
  'continueCreation',
  Contracts.FundFactory,
  undefined,
  undefined,
  undefined,
  { amguPayable: true },
);
