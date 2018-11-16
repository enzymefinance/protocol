import { callFactoryWithoutParams } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const getPriceSource = callFactoryWithoutParams(
  'priceSource',
  Contracts.AmguConsumer,
);

export { getPriceSource };
