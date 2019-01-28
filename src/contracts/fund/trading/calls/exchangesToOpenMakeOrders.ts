import {
  callFactory,
  PrepareCallArgsFunction,
  PostProcessCallFunction,
} from '~/utils/solidity/callFactory';
import { Contracts, Exchanges } from '~/Contracts';
import { TokenInterface, createQuantity } from '@melonproject/token-math';
import { getFundOpenOrder } from './getFundOpenOrder';

interface ExchangesToOpenMakeOrdersArgs {
  token: TokenInterface;
  exchange: Exchanges;
}

const prepareArgs: PrepareCallArgsFunction = (
  environment,
  { token, exchange }: ExchangesToOpenMakeOrdersArgs,
) => {
  const exchangeAddress =
    environment.deployment.exchangeConfigs[exchange].exchange;
  const tokenAddress = token.address;

  return [exchangeAddress.toString(), tokenAddress.toString()];
};

const postProcess: PostProcessCallFunction = async (
  environment,
  result,
  prepared,
) => {
  const { orderIndex, expiresAt } = result;

  if (expiresAt === '0') return null;

  const openOrder = await getFundOpenOrder(
    environment,
    prepared.contractAddress,
    orderIndex,
  );

  const order = {
    fillTakerQuantity: createQuantity(
      openOrder.takerQuantity.token,
      openOrder.fillTakerQuantity,
    ),
    id: openOrder.id,
    index: orderIndex,
    makerQuantity: openOrder.makerQuantity,
    takerQuantity: openOrder.takerQuantity,
    timestamp: openOrder.timestamp,
  };

  return order;
};

const exchangesToOpenMakeOrders = callFactory(
  'exchangesToOpenMakeOrders',
  Contracts.Trading,
  { prepareArgs, postProcess },
);

export { exchangesToOpenMakeOrders };
