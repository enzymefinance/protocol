import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const getFundHoldings = callFactoryWithoutParams(
  'getFundHoldings',
  Contracts.Accounting,
);

export { getFundHoldings };
