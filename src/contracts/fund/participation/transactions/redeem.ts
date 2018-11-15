import {
  transactionFactory,
  GuardFunction,
  PostProcessFunction,
  getContract,
} from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { getRequest } from '../calls/getRequest';
import {
  QuantityInterface,
  createQuantity,
  greaterThan,
} from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken, balanceOf } from '~/contracts/dependencies/token';
import { getHub, getSettings, ensureIsNotShutDown } from '../../hub';

const guard = async (params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);
  const balance = await balanceOf(settings.sharesAddress, {
    address: environment.wallet.address,
  });
  ensure(
    greaterThan(balance, createQuantity(fundToken, '0')),
    `Address ${
      environment.wallet.address
    } doesn't own shares of the fund ${hub}`,
  );
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);
  console.log(receipt);
  return {
    shareQuantity: createQuantity(
      fundToken,
      receipt.events.SuccessFulRedemption.returnValues.quantity,
    ),
  };
};

const redeem = transactionFactory(
  'redeem',
  Contracts.Participation,
  guard,
  undefined,
  postProcess,
);

export { redeem };
