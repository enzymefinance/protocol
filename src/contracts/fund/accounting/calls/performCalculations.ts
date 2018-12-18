import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getDenominationAsset } from './getDenominationAsset';
import {
  createQuantity,
  QuantityInterface,
} from '@melonproject/token-math/quantity';

interface PerformCalculationsResult {
  gav: QuantityInterface;
  nav: QuantityInterface;
  sharePrice: QuantityInterface;
}

const postProcess = async (
  environment,
  result,
  prepared,
): Promise<PerformCalculationsResult> => {
  const quoteToken = await getDenominationAsset(
    environment,
    prepared.contractAddress,
  );
  const calculations = {
    gav: createQuantity(quoteToken, result.gav),
    nav: createQuantity(quoteToken, result.nav),
    sharePrice: createQuantity(quoteToken, result.sharePrice),
  };

  return calculations;
};

const performCalculations = callFactoryWithoutParams(
  'performCalculations',
  Contracts.Accounting,
  {
    postProcess,
  },
);

export { performCalculations };
