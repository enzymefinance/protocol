import * as R from 'ramda';

import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { createQuantity } from '@melonproject/token-math';

const postProcess = async (environment, result) => {
  const { '0': holdings, '1': tokenAddresses } = result;
  const zipped = R.zip(holdings, tokenAddresses);
  const fundHoldings = zipped.map(async ([holding, tokenAddress]) => {
    const token = await getToken(environment, tokenAddress);
    return createQuantity(token, holding);
  });

  return Promise.all(fundHoldings);
};

const getFundHoldings = callFactoryWithoutParams(
  'getFundHoldings',
  Contracts.Accounting,
  {
    postProcess,
  },
);

export { getFundHoldings };
