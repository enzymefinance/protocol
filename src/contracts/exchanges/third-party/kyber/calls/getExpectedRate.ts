import {
  createPrice,
  createQuantity,
  PriceInterface,
  TokenInterface,
  QuantityInterface,
} from '@melonproject/token-math';

import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

const kyberEthAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const getExpectedRate = async (
  environment: Environment,
  contractAddress: string,
  nativeAsset: TokenInterface,
  makerAsset: TokenInterface,
  takerAsset: TokenInterface,
  fillTakerQuantity: QuantityInterface,
): Promise<PriceInterface> => {
  const contract = await getContract(
    environment,
    Contracts.KyberNetworkProxy,
    contractAddress,
  );

  const srcTokenAddress =
    takerAsset.address === nativeAsset.address
      ? kyberEthAddress
      : takerAsset.address;
  const destTokenAddress =
    makerAsset.address === nativeAsset.address
      ? kyberEthAddress
      : makerAsset.address;

  const { 1: price } = await contract.methods
    .getExpectedRate(
      srcTokenAddress,
      destTokenAddress,
      `${fillTakerQuantity.quantity}`,
    )
    .call();

  const base = createQuantity(takerAsset, 1);
  const quote = createQuantity(makerAsset, price);
  return createPrice(base, quote);
};
