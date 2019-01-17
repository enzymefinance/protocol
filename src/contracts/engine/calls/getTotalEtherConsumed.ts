import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { createQuantity } from '@melonproject/token-math';
import { emptyAddress } from '~/utils/constants/emptyAddress';

const postProcess = async (environment, result) => {
  return createQuantity(emptyAddress, result);
};

const getTotalEtherConsumed = callFactoryWithoutParams(
  'totalEtherConsumed',
  Contracts.Engine,
  { postProcess },
);

export { getTotalEtherConsumed };
