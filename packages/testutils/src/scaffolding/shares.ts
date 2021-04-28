import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, StandardToken } from '@enzymefinance/protocol';
import { BigNumberish, utils } from 'ethers';

export interface BuySharesParams {
  comptrollerProxy: ComptrollerLib;
  denominationAsset: StandardToken;
  buyer: SignerWithAddress;
  investmentAmount?: BigNumberish;
  minSharesQuantity?: BigNumberish;
  seedBuyer?: boolean;
}

export interface RedeemSharesParams {
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

export async function redeemShares({
  comptrollerProxy,
  signer,
  recipient = signer,
  quantity,
  additionalAssets = [],
  assetsToSkip = [],
}: RedeemSharesParams) {
  if (quantity == undefined) {
    if (additionalAssets.length > 0 || assetsToSkip.length > 0) {
      throw 'Must specify shares quantity if specifying additional assets or assets to skip';
    }
    return comptrollerProxy.connect(signer).redeemShares();
  } else {
    return comptrollerProxy.connect(signer).redeemSharesDetailed(recipient, quantity, additionalAssets, assetsToSkip);
  }
}
