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
  const [
    investmentAssetAddress,
    investmentAmountUint,
    requestedSharesUint,
    timestampUint,
    atUpdateIdUint,
  ] = result;

  const investToken = await getToken(investmentAssetAddress, environment);
  const hub = await getHub(prepared.contractAddress, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);

  return {
    atUpdateId: atUpdateIdUint.toNumber(),
    investmentAmount: createQuantity(investToken, investmentAmountUint),
    requestedShares: createQuantity(fundToken, requestedSharesUint),
    timestamp: timestampUint.toNumber(),
  };
};

const getRequest = callFactory('getRequest', Contracts.Participation, {
  postProcess,
  prepareArgs,
});

export { getRequest };
