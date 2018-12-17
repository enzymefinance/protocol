import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getQuoteToken } from './getQuoteToken';
import {
  createQuantity,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getSettings } from '../../hub/calls/getSettings';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getPrice, PriceInterface } from '@melonproject/token-math/price';

interface PerformCalculationsResult {
  gav: QuantityInterface;
  nav: QuantityInterface;
  sharePrice: PriceInterface;
}

const postProcess = async (
  environment,
  result,
  prepared,
): Promise<PerformCalculationsResult> => {
  const quoteToken = await getQuoteToken(environment, prepared.contractAddress);
  const hub = await getHub(environment, prepared.contractAddress);
  const settings = await getSettings(environment, hub);
  const fundToken = await getToken(environment, settings.sharesAddress);

  const calculations = {
    gav: createQuantity(quoteToken, result.gav),
    nav: createQuantity(quoteToken, result.nav),
    sharePrice: getPrice(
      createQuantity(fundToken, 1),
      createQuantity(quoteToken, result.sharePrice),
    ),
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
