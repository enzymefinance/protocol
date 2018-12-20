import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { callFactory } from '~/utils/solidity/callFactory';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { getHub } from '~/contracts/fund/hub/calls/getHub';

export interface RequestInvestmentResult {
  investmentAmount: QuantityInterface;
  requestedShares: QuantityInterface;
  timestamp: number;
}

const prepareArgs = (_, { of }) => [of.toString()];
const postProcess = async (
  environment,
  result,
  prepared,
): Promise<RequestInvestmentResult> => {
  const investToken = await getToken(environment, result.investmentAsset);
  const hub = await getHub(environment, prepared.contractAddress);
  const routes = await getRoutes(environment, hub);
  const fundToken = await getToken(environment, routes.sharesAddress);

  return {
    investmentAmount: createQuantity(investToken, result.investmentAmount),
    requestedShares: createQuantity(fundToken, result.requestedShares),
    timestamp: parseInt(result.timestamp, 10),
  };
};

const getRequest = callFactory('requests', Contracts.Participation, {
  postProcess,
  prepareArgs,
});

export { getRequest };
