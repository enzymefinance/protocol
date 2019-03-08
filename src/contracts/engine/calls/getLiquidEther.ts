import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { createQuantity } from '@melonproject/token-math';

const postProcess = async (_, result) => {
  return createQuantity('ETH', result);
};

const getLiquidEther = callFactoryWithoutParams(
  'liquidEther',
  Contracts.Engine,
  { postProcess },
);

export { getLiquidEther };
