import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const prepareArgs = (environment, { investor }) => [investor.toString()];

const postProcess = async (environment, result) => {
  return result;
};

const hasValidRequest = callFactory(
  'hasValidRequest',
  Contracts.Participation,
  { prepareArgs, postProcess },
);

export { hasValidRequest };
