import { callFactoryWithoutParams } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const getAmguPrice = callFactoryWithoutParams(
  'getAmguPrice',
  Contracts.Version,
);

export { getAmguPrice };
