import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const postProcess = async (environment, result) => {
  return result;
};

const getTotalAmguConsumed = callFactoryWithoutParams(
  'totalAmguConsumed',
  Contracts.Engine,
  { postProcess },
);

export { getTotalAmguConsumed };
