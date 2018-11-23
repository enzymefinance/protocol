import { Address } from '@melonproject/token-math/address';
import {
  createQuantity,
  greaterThan,
  isEqual,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import {
  transactionFactory,
  PrepareArgsFunction,
  PostProcessFunction,
} from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { Contracts } from '~/Contracts';
import { getToken, balanceOf } from '~/contracts/dependencies/token';
import { getHub, getSettings, ensureIsNotShutDown } from '../../hub';

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
