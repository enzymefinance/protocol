import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { createQuantity } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';

const guard = async (environment, params, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  // TODO: check if any other pre flights necessary
  await ensureIsNotShutDown(environment, hub);
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  const routes = await getRoutes(environment, hub);
  const fundToken = await getToken(environment, routes.sharesAddress);
  return {
    receipt,
    shareQuantity: createQuantity(
      fundToken,
      receipt.events.FeeRewarded.returnValues.shareQuantity,
    ),
  };
};

const triggerRewardAllFees = transactionFactory(
  'triggerRewardAllFees',
  Contracts.Accounting,
  guard,
  undefined,
  postProcess,
);

export { triggerRewardAllFees };
