import { Contract, transactionFactory } from '~/utils/solidity';

export const continueCreation = transactionFactory(
  'continueCreation',
  Contract.FundFactory,
);
