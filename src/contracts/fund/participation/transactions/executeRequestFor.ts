import { Address } from '@melonproject/token-math/address';

import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import { getRequest } from '../calls/getRequest';
import { createQuantity, greaterThan } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
// tslint:disable-next-line:max-line-length
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';

export interface ExecuteRequestForArgs {
  who: Address;
}

const guard = async (environment, params, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  await ensureIsNotShutDown(environment, hub);
  const settings = await getSettings(environment, hub);
  const fundToken = await getToken(environment, settings.sharesAddress);
  const request = await getRequest(environment, contractAddress, {
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

const prepareArgs: PrepareArgsFunction<ExecuteRequestForArgs> = async (
  _,
  { who },
) => {
  return [who.toString()];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  const settings = await getSettings(environment, hub);
  const fundToken = await getToken(environment, settings.sharesAddress);

  return {
    shareQuantity: createQuantity(
      fundToken,
      receipt.events.RequestExecution.returnValues.requestedShares,
    ),
  };
};

const executeRequestFor = transactionFactory(
  'executeRequestFor',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
  { amguPayable: true },
);

export { executeRequestFor };
