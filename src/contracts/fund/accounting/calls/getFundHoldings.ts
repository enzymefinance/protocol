import { callFactoryWithoutParams } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const getFundHoldings = callFactoryWithoutParams(
  'getFundHoldings',
  Contracts.Accounting,
);

export { getFundHoldings };
