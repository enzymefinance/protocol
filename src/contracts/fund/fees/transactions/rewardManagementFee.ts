import { transactionFactory } from '~/utils/solidity';
import { createQuantity } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token';
import { getHub, getSettings, ensureIsNotShutDown } from '../../hub';

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
