import { callFactoryWithoutParams } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { isEmptyAddress } from '~/utils/checks/isEmptyAddress';

type GetFundHoldingsResult = Array<QuantityInterface>;

const postProcess = async (
  environment,
  result,
  prepared,
): Promise<GetFundHoldingsResult> => {
  let fundHoldings = [];

  for (let i = 0; i < result[1].length; i++) {
    const address = result[1][i];
    const quantity = result[0][i];
    if (!isEmptyAddress(address)) {
      const token = await getToken(environment, address);
      fundHoldings[i] = createQuantity(token, quantity);
    }
  }

  return fundHoldings;
};

const getFundHoldings = callFactoryWithoutParams(
  'getFundHoldings',
  Contracts.Accounting,
  {
    postProcess,
  },
);

export { getFundHoldings };
