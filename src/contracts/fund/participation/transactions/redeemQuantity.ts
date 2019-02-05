import * as R from 'ramda';

import {
  transactionFactory,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import {
  createQuantity,
  greaterThan,
  QuantityInterface,
  toFixed,
  isZero,
  createToken,
} from '@melonproject/token-math';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { isEmptyAddress } from '~/utils/checks/isEmptyAddress';

export interface RedeemQuantityArgs {
  sharesQuantity: QuantityInterface;
}

const guard = async (environment, { sharesQuantity }, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  await ensureIsNotShutDown(environment, hub);
  const routes = await getRoutes(environment, hub);
  const balance = await balanceOf(environment, routes.sharesAddress, {
    address: environment.wallet.address,
  });

  ensure(
    greaterThan(balance, sharesQuantity),
    `Address ${environment.wallet.address} doesn't have ${toFixed(
      sharesQuantity,
    )} shares of the fund ${hub}. Only: ${toFixed(balance)}`,
  );
};

const prepareArgs: PrepareArgsFunction<RedeemQuantityArgs> = async (
  _,
  { sharesQuantity },
) => {
  return [sharesQuantity.quantity.toString()];
};

const postProcess = async (environment, receipt, _, contractAddress) => {
  const hub = await getHub(environment, contractAddress);
  const routes = await getRoutes(environment, hub);
  const fundToken = await getToken(environment, routes.sharesAddress);
  const redemption = receipt.events.Redemption.returnValues;

  ensure(!!redemption, 'No Redemption log found in transaction');

  const redemptionAddressQuantityPairs = R.zip(
    redemption.assets,
    redemption.assetQuantities,
  );

  const redemptionsPromises = redemptionAddressQuantityPairs.map(
    async ([tokenAddress, quantity]) => {
      const token = isEmptyAddress(tokenAddress)
        ? createToken('EMPTY')
        : await getToken(environment, tokenAddress);
      return createQuantity(token, quantity);
    },
  );

  const redemptions = await Promise.all(redemptionsPromises);

  const redeemedShares = createQuantity(fundToken, redemption.redeemedShares);

  return {
    redeemedShares,
    redemptions: redemptions.filter((q: QuantityInterface) => !isZero(q)),
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
