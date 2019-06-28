import { createPrice, createQuantity } from '@melonproject/token-math';

import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { kyberEthAddress } from '~/utils/constants/kyberEthAddress';

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

const postProcess = async (_, result, prepared) => {
  const { 1: price } = result;

  // The price is always returned with 18 decimals, hence we need to
  // adjust it to the number of decimals of the respective maker asset.
  const length = prepared.params.makerAsset.decimals + price.length - 18;
  const truncated = price.substr(0, length);

  const base = createQuantity(prepared.params.takerAsset, 1);
  const quote = createQuantity(prepared.params.makerAsset, truncated);
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
