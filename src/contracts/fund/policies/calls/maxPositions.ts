import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';

const maxPositions = callFactoryWithoutParams(
  'maxPositions',
  Contracts.MaxPositions,
);

export { maxPositions };
