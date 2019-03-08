import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';

const postProcess = async (environment, result, prepared) => {
  return result;
};

const getPremiumPercent = callFactoryWithoutParams(
  'premiumPercent',
  Contracts.Engine,
  { postProcess },
);

export { getPremiumPercent };
