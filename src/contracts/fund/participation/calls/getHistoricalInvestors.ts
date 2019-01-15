import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const getHistoricalInvestors = callFactoryWithoutParams(
  'getHistoricalInvestors',
  Contracts.Participation,
);

export { getHistoricalInvestors };
