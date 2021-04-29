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

export interface RedeemSharesInKindParams {
  comptrollerProxy: ComptrollerLib;
  signer: SignerWithAddress;
  recipient?: AddressLike;
  quantity?: BigNumberish;
  additionalAssets?: AddressLike[];
  assetsToSkip?: AddressLike[];
}

export async function buyShares({
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

  return comptrollerProxy.connect(buyer).buyShares(investmentAmount, minSharesQuantity);
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
