import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const prepareArgs = (_, { asset }) => [asset];
const postProcess = async (environment, result, prepared) => {
  return result;
};

const investAllowed = callFactory('investAllowed', Contracts.Participation, {
  postProcess,
  prepareArgs,
});

export { investAllowed };
