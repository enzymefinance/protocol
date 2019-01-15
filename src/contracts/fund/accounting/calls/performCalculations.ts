import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getDenominationAsset } from './getDenominationAsset';
import {
  createQuantity,
  QuantityInterface,
  createPrice,
  PriceInterface,
} from '@melonproject/token-math';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getRoutes } from '../../hub/calls/getRoutes';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

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
  const quoteToken = await getDenominationAsset(
    environment,
    prepared.contractAddress,
  );
  const hub = await getHub(environment, prepared.contractAddress);
  const settings = await getRoutes(environment, hub);
  const fundToken = await getToken(environment, settings.sharesAddress);

  const calculations = {
    gav: createQuantity(quoteToken, result.gav),
    nav: createQuantity(quoteToken, result.nav),
    sharePrice: createPrice(
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
