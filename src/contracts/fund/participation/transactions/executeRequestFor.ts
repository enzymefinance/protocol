import { transactionFactory, PrepareArgsFunction } from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { getRequest } from '../calls/getRequest';
import { createQuantity, greaterThan } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token';
import { getHub, getSettings, ensureIsNotShutDown } from '../../hub';
import { Address } from '~/utils';

export interface ExecuteRequestForArgs {
  who: Address;
}

const guard = async (params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);
  const request = await getRequest(contractAddress, {
    of: environment.wallet.address,
  });
  ensure(
    greaterThan(request.requestedShares, createQuantity(fundToken, '0')),
    'Amount of requested shares is null',
  );
  // TODO: remaining pre flights
  // ensure isRecent
  // ensure isPriceRecent
};

const prepareArgs: PrepareArgsFunction<ExecuteRequestForArgs> = async ({
  who,
}) => {
  return [who.toString()];
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

const executeRequestFor = transactionFactory(
  'executeRequestFor',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
);

export { executeRequestFor };
