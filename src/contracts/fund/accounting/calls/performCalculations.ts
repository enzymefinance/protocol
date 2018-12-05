import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getQuoteToken } from './getQuoteToken';
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
  result,
  prepared,
  environment,
): Promise<PerformCalculationsResult> => {
  const quoteToken = await getQuoteToken(prepared.contractAddress, environment);
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
