import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const getFundFactory = callFactoryWithoutParams(
  'fundFactory',
  Contracts.MockVersion,
);

export { getFundFactory };
