import { createPrice, createQuantity } from '@melonproject/token-math';

import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';

const kyberEthAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const prepareArgs = (
  environment,
  {
    nativeAsset = getTokenBySymbol(environment, 'WETH'),
    makerAsset,
    takerAsset,
    fillTakerQuantity,
  },
) => {
  const srcTokenAddress =
    takerAsset.address === nativeAsset.address
      ? kyberEthAddress
      : takerAsset.address;
  const destTokenAddress =
    makerAsset.address === nativeAsset.address
      ? kyberEthAddress
      : makerAsset.address;
  const args = [
    srcTokenAddress,
    destTokenAddress,
    fillTakerQuantity.quantity.toString(),
  ];
  return args;
};

const postProcess = async (environment, result, prepared) => {
  const { 1: price } = result;
  const base = createQuantity(prepared.params.takerAsset, 1);
  const quote = createQuantity(prepared.params.makerAsset, price);
  return createPrice(base, quote);
};

const getExpectedRate = callFactory(
  'getExpectedRate',
  Contracts.KyberNetworkProxy,
  {
    postProcess,
    prepareArgs,
  },
);

export { getExpectedRate };
