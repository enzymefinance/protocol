import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const prepareArgs = (environment, { investor }) => [investor.toString()];

const postProcess = async (environment, result) => {
  return result;
};

const hasExpiredRequest = callFactory(
  'hasExpiredRequest',
  Contracts.Participation,
  { prepareArgs, postProcess },
);

export { hasExpiredRequest };
