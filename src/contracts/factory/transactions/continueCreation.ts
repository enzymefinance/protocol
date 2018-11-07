import { transactionFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

export const continueCreation = transactionFactory(
  'continueCreation',
  Contracts.FundFactory,
);
