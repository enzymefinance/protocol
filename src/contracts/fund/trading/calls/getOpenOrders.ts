import * as R from 'ramda';

import {
  callFactoryWithoutParams,
  PostProcessCallFunction,
} from '~/utils/solidity/callFactory';
import { Contracts, Exchanges } from '~/Contracts';
import { exchangesToOpenMakeOrders } from './exchangesToOpenMakeOrders';

const postProcess: PostProcessCallFunction = async (
  environment,
  _,
  prepared,
) => {
  const exchangesXtokens = R.xprod(
    Object.values(Exchanges),
    environment.deployment.thirdPartyContracts.tokens,
  );

  const openOrdersPromises = exchangesXtokens.map(([exchange, token]) =>
    exchangesToOpenMakeOrders(environment, prepared.contractAddress, {
      exchange,
      token,
    }),
  );

  const openOrders = await Promise.all(openOrdersPromises);

  return openOrders.filter(o => !!o);
};

const getOpenOrders = callFactoryWithoutParams(
  'ORDER_LIFESPAN',
  Contracts.Trading,
  {
    postProcess,
  },
);

export { getOpenOrders };
