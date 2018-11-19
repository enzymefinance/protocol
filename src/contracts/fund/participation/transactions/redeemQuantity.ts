import { transactionFactory, PrepareArgsFunction } from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import {
  createQuantity,
  greaterThan,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken, balanceOf } from '~/contracts/dependencies/token';
import { getHub, getSettings, ensureIsNotShutDown } from '../../hub';

export interface RedeemQuantityArgs {
  sharesQuantity: QuantityInterface;
}

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

const PrepareArgsFunction: PrepareArgsFunction<RedeemQuantityArgs> = async ({
  sharesQuantity,
}) => {
  return [sharesQuantity.toString()];
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);

  return {
    shareQuantity: createQuantity(
      fundToken,
      receipt.events.SuccessfulRedemption.returnValues.quantity,
    ),
  };
};

const redeemQuantity = transactionFactory(
  'redeemQuantity',
  Contracts.Participation,
  guard,
  PrepareArgsFunction,
  postProcess,
);

export { redeemQuantity };
