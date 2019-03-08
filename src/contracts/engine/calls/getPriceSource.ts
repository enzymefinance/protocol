import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const getPriceSource = callFactoryWithoutParams(
  'priceSource',
  Contracts.AmguConsumer,
);

export { getPriceSource };
