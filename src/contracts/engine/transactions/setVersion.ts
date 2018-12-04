import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const prepareArgs = async ({ versionAddress }) => {
  return [`${versionAddress}`];
};

export const setVersion = transactionFactory(
  'setVersion',
  Contracts.Engine,
  null,
  prepareArgs,
  null,
);
