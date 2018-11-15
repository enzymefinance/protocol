import {
  transactionFactory,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token';
import { getHub, getSettings, ensureIsNotShutDown } from '../../hub';

const guard = async (params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);
  return {
    shareQuantity: createQuantity(
      fundToken,
      receipt.events.RequestExecuted.returnValues.requestedShares,
    ),
  };
};

const executeRequest = transactionFactory(
  'executeRequest',
  Contracts.Participation,
  guard,
  undefined,
  postProcess,
);

export { executeRequest };
