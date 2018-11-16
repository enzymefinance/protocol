import { transactionFactory } from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { getRequest } from '../calls/getRequest';
import { createQuantity, greaterThan } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token';
import { getHub, getSettings, ensureIsNotShutDown } from '../../hub';

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

const postProcess = async (receipt, params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);

  console.log(receipt);

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
