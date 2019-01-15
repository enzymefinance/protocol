import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import { createQuantity, greaterThan } from '@melonproject/token-math';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';

const guard = async (environment, params, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  await ensureIsNotShutDown(environment, hub);
  const routes = await getRoutes(environment, hub);
  const fundToken = await getToken(environment, routes.sharesAddress);
  const balance = await balanceOf(environment, routes.sharesAddress, {
    address: environment.wallet.address,
  });
  ensure(
    greaterThan(balance, createQuantity(fundToken, '0')),
    `Address ${
      environment.wallet.address
    } does not own shares of the fund ${hub}`,
  );
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  const routes = await getRoutes(environment, hub);
  const fundToken = await getToken(environment, routes.sharesAddress);

  return {
    shareQuantity: createQuantity(
      fundToken,
      receipt.events.SuccessfulRedemption.returnValues.quantity,
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
