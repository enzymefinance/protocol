import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { createQuantity } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';

const guard = async (params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);
  //TODO: check if any other pre flights necessary
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);

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
