import * as R from 'ramda';

import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import {
  createQuantity,
  createToken,
  QuantityInterface,
} from '@melonproject/token-math';
import { isEmptyAddress } from '~/utils/checks/isEmptyAddress';

const postProcess = async (environment, result) => {
  const { '0': holdings, '1': tokenAddresses } = result;
  const zipped = R.zip(holdings, tokenAddresses);

  const fundHoldingsPromises: Promise<QuantityInterface>[] = zipped.map(
    async ([holding, tokenAddress]) => {
      const token = isEmptyAddress(tokenAddress)
        ? createToken('ZERO', tokenAddress)
        : await getToken(environment, tokenAddress);
      return createQuantity(token, holding);
    },
  );

  const fundHoldings = await Promise.all(fundHoldingsPromises);

  const filtered = fundHoldings.filter(
    holding => !isEmptyAddress(holding.token.address),
  );

  return filtered;
};

const getFundHoldings = callFactoryWithoutParams(
  'getFundHoldings',
  Contracts.Accounting,
  {
    postProcess,
  },
);

export { getFundHoldings };
