import { Contracts } from '~/Contracts';
import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';

const maxConcentration = callFactoryWithoutParams(
  'maxConcentration',
  Contracts.MaxConcentration,
);

export { maxConcentration };
