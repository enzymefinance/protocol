import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { createQuantity } from '@melonproject/token-math';
import { emptyAddress } from '~/utils/constants/emptyAddress';

const postProcess = async (environment, result) => {
  return createQuantity(emptyAddress, result);
};

const getFrozenEther = callFactoryWithoutParams(
  'frozenEther',
  Contracts.Engine,
  { postProcess },
);

export { getFrozenEther };
