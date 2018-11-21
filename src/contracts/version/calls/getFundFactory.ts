import { callFactoryWithoutParams } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

const getFundFactory = callFactoryWithoutParams(
  'fundFactory',
  Contracts.MockVersion,
);

export { getFundFactory };
