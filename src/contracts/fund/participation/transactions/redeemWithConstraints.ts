import { transactionFactory, PrepareArgsFunction } from '~/utils/solidity';
import { ensure } from '~/utils/guards';
import { Address } from '~/utils/types';
import {
  createQuantity,
  greaterThan,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { getToken, balanceOf } from '~/contracts/dependencies/token';
import { getHub, getSettings, ensureIsNotShutDown } from '../../hub';

export interface RedeemWithConstraintsArgs {
  sharesQuantity: QuantityInterface;
  requestedAssets: Address[];
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
    greaterThan(
      balance,
      createQuantity(fundToken, params.sharesQuantity.toString()),
    ), // there's no greaterThanOrEqualTo function yet
    `Address ${
      environment.wallet.address
    } doesn't have enough shares of the fund ${hub}`,
  );
};

const prepareArgs: PrepareArgsFunction<RedeemWithConstraintsArgs> = async ({
  sharesQuantity,
  requestedAssets,
}) => [
  sharesQuantity.toString(),
  requestedAssets.map(asset => asset.toString()),
];

const postProcess = async receipt => {
  return true;
};

const redeemWithConstraints = transactionFactory(
  'redeemWithConstraints',
  Contracts.Participation,
  guard,
  prepareArgs,
  postProcess,
);

export { redeemWithConstraints };
