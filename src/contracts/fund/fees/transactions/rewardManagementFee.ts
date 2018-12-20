import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { createQuantity } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';

const guard = async (environment, params, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  await ensureIsNotShutDown(environment, hub);
  //TODO: check if any other pre flights necessary
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

const rewardManagementFee = transactionFactory(
  'rewardManagementFee',
  Contracts.FeeManager,
  guard,
  undefined,
  postProcess,
);

export { rewardManagementFee };
