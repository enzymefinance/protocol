import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { callFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token';
import { getHub, getSettings } from '../../hub';

export interface RequestInvestmentResult {
  investmentAmount: QuantityInterface;
  requestedShares: QuantityInterface;
  timestamp: number;
  atUpdateId: number;
}

const prepareArgs = ({ of }) => [of.toString()];
const postProcess = async (
  result,
  prepared,
  environment,
): Promise<RequestInvestmentResult> => {
  const investToken = await getToken(result.investmentAsset, environment);
  const hub = await getHub(prepared.contractAddress, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);

  return {
    atUpdateId: parseInt(result.atUpdateId, 10),
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
