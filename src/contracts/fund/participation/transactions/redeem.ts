import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import { createQuantity, greaterThan } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';

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
    } does not own shares of the fund ${hub}`,
  );
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

const redeem = transactionFactory(
  'redeem',
  Contracts.Participation,
  guard,
  undefined,
  postProcess,
);

export { redeem };
