import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';

const guards = async () => {};

const prepareArgs = async (_, { versionAddress }) => [`${versionAddress}`];

const postProcess = async () => {};

export const setVersion = transactionFactory(
  'setVersion',
  Contracts.Engine,
  guards,
  prepareArgs,
  postProcess,
  {},
);
