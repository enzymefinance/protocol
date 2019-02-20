import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';

const tolerance = callFactoryWithoutParams(
  'tolerance',
  Contracts.PriceTolerance,
);

export { tolerance };
