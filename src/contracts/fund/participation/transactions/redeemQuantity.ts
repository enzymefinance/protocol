import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import {
  createQuantity,
  greaterThan,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';

export interface RedeemQuantityArgs {
  sharesQuantity: QuantityInterface;
}

const guard = async (environment, params, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  await ensureIsNotShutDown(hub, environment);
  const routes = await getRoutes(hub, environment);
  const fundToken = await getToken(environment, routes.sharesAddress);
  const balance = await balanceOf(routes.sharesAddress, {
    address: environment.wallet.address,
  });
  ensure(
    greaterThan(balance, createQuantity(fundToken, '0')),
    `Address ${
      environment.wallet.address
    } doesn't own shares of the fund ${hub}`,
  );
};

const prepareArgs: PrepareArgsFunction<RedeemQuantityArgs> = async (
  _,
  { sharesQuantity },
) => {
  return [sharesQuantity.toString()];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  const hub = await getHub(contractAddress, environment);
  const routes = await getRoutes(environment, hub);
  const fundToken = await getToken(environment, routes.sharesAddress);

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
  prepareArgs,
  postProcess,
);

export { redeemQuantity };
