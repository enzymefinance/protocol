import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import createQuantity from '@melonproject/token-math/quantity/createQuantity';
import createPrice from '@melonproject/token-math/price/createPrice';
import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';
import { divide, multiply } from '@melonproject/token-math';

const prepareArgs = (
  environment,
  {
    targetExchange,
    nativeAsset = getTokenBySymbol(environment, 'WETH'),
    makerAsset,
    takerAsset,
    takerQuantity,
  },
) => {
  const args = [
    targetExchange.toLowerCase(),
    nativeAsset.address,
    takerAsset.address,
    takerQuantity.quantity.toString(),
    makerAsset.address,
  ];
  return args;
};

const postProcess = async (_, result, prepared) => {
  const base = createQuantity(prepared.params.takerAsset, 1);
  const pricePerUnit = divide(
    multiply(result, base.quantity),
    prepared.params.takerQuantity.quantity,
  );
  const quote = createQuantity(prepared.params.makerAsset, pricePerUnit);
  return createPrice(base, quote);
};

const getUniswapRate = callFactory('getInputPrice', Contracts.UniswapAdapter, {
  postProcess,
  prepareArgs,
});

export { getUniswapRate };
