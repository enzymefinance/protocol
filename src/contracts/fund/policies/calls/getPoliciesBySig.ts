import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface SigResults {
  pre: Address[];
  post: Address[];
}

const postProcess = async (
  environment,
  result,
  { params },
): Promise<SigResults> => {
  return {
    pre: result['0'].map(a => new Address(a)),
    post: result['1'].map(a => new Address(a)),
  };
};

const getPoliciesBySig = callFactory(
  'getPoliciesBySig',
  Contracts.PolicyManager,
  {
    postProcess,
  },
);

export { getPoliciesBySig };
