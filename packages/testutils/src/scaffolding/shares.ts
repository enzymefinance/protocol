import type { AddressLike } from '@enzymefinance/ethers';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, StandardToken } from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';
import { constants, utils } from 'ethers';

import { seedAccount } from '../accounts';

export interface BuySharesParams {
  comptrollerProxy: ComptrollerLib;
  denominationAsset: StandardToken;
  buyer: SignerWithAddress;
  investmentAmount?: BigNumberish;
  minSharesQuantity?: BigNumberish;
  seedBuyer?: boolean;
  provider: EthereumTestnetProvider;
}

export interface RedeemSharesForSpecificAssetsParams {
  comptrollerProxy: ComptrollerLib;
  signer: SignerWithAddress;
  recipient?: AddressLike;
  quantity?: BigNumberish;
  payoutAssets: AddressLike[];
  payoutAssetPercentages: BigNumberish[];
}

export interface RedeemSharesInKindParams {
  comptrollerProxy: ComptrollerLib;
  signer: SignerWithAddress;
  recipient?: AddressLike;
  quantity?: BigNumberish;
  additionalAssets?: AddressLike[];
  assetsToSkip?: AddressLike[];
}

export async function buyShares(options: BuySharesParams) {
  return (await buySharesFunction(options)).send();
}

export async function buySharesFunction({
  comptrollerProxy,
  denominationAsset,
  buyer,
  investmentAmount,
  minSharesQuantity = 1,
  seedBuyer = false,
  provider,
}: BuySharesParams) {
  // eslint-disable-next-line
  if (investmentAmount == null) {
    investmentAmount = utils.parseUnits('1', await denominationAsset.decimals());
  }

  if (seedBuyer) {
    await seedAccount({ account: buyer, amount: investmentAmount, provider, token: denominationAsset });
  }

  await denominationAsset.connect(buyer).approve(comptrollerProxy, investmentAmount);

  return comptrollerProxy.connect(buyer).buyShares.args(investmentAmount, minSharesQuantity).ref;
}

export async function redeemSharesForSpecificAssets({
  comptrollerProxy,
  signer,
  recipient = signer,
  quantity = constants.MaxUint256,
  payoutAssets,
  payoutAssetPercentages,
}: RedeemSharesForSpecificAssetsParams) {
  return comptrollerProxy
    .connect(signer)
    .redeemSharesForSpecificAssets(recipient, quantity, payoutAssets, payoutAssetPercentages);
}

export async function redeemSharesInKind({
  comptrollerProxy,
  signer,
  recipient = signer,
  quantity = constants.MaxUint256,
  additionalAssets = [],
  assetsToSkip = [],
}: RedeemSharesInKindParams) {
  return comptrollerProxy.connect(signer).redeemSharesInKind(recipient, quantity, additionalAssets, assetsToSkip);
}
