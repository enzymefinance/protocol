import { Address } from '@melonproject/token-math/address';
import {
  transactionFactory,
  PrepareArgsFunction,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import {
  createQuantity,
  greaterThan,
  isEqual,
  QuantityInterface,
} from '@melonproject/token-math/quantity';

import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
// tslint:disable-next-line:max-line-length
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';

export interface RedeemWithConstraintsArgs {
  sharesQuantity: QuantityInterface;
  requestedAssets: [Address];
}

// TODO: do real postprocessing
export interface RedeemWithConstraintsResult {
  success: boolean;
}

const guard = async (params, contractAddress, environment) => {
  const hub = await getHub(contractAddress, environment);
  await ensureIsNotShutDown(hub, environment);
  const settings = await getSettings(hub, environment);
  const fundToken = await getToken(settings.sharesAddress, environment);
  const balance = await balanceOf(settings.sharesAddress, {
    address: environment.wallet.address,
  });
  const shareQuantity = createQuantity(fundToken, `${params.sharesQuantity}`);
  ensure(
    greaterThan(balance, shareQuantity) || isEqual(balance, shareQuantity),
    `Address ${
      environment.wallet.address
    } doesn't have enough shares of the fund ${hub}`,
  );
};

const prepareArgs: PrepareArgsFunction<RedeemWithConstraintsArgs> = async ({
  sharesQuantity,
  requestedAssets,
}) => [`${sharesQuantity}`, requestedAssets.map(asset => `${asset}`)];

const postProcess: PostProcessFunction<
  RedeemWithConstraintsArgs,
  RedeemWithConstraintsResult
> = async receipt => {
  return { success: true };
};

const redeemWithConstraints = transactionFactory<
  RedeemWithConstraintsArgs,
  RedeemWithConstraintsResult
>(
  'redeemWithConstraints',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
);

export { redeemWithConstraints };
