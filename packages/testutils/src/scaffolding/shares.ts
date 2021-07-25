import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, StandardToken } from '@enzymefinance/protocol';
import { BigNumberish, constants, utils } from 'ethers';

export interface BuySharesParams {
  comptrollerProxy: ComptrollerLib;
  denominationAsset: StandardToken;
  buyer: SignerWithAddress;
  investmentAmount?: BigNumberish;
  minSharesQuantity?: BigNumberish;
  seedBuyer?: boolean;
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
}: BuySharesParams) {
  if (investmentAmount == undefined) {
    investmentAmount = utils.parseUnits('1', await denominationAsset.decimals());
  }
  if (seedBuyer) {
    await denominationAsset.transfer(buyer, investmentAmount);
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
