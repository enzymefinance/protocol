import { BigNumberish, Signer, utils } from 'ethers';
import { AddressLike, Contract, Send } from '@crestproject/crestproject';
import { ComptrollerLib } from '@melonproject/protocol';

// prettier-ignore
export interface DenominationAssetInterface extends Contract<any> {
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean, any>;
}

export interface BuySharesParams {
  comptrollerProxy: ComptrollerLib;
  signer: Signer;
  buyer: AddressLike;
  denominationAsset: DenominationAssetInterface;
  amguValue?: BigNumberish;
  investmentAmount?: BigNumberish;
  minSharesAmount?: BigNumberish;
}

export interface RedeemSharesParams {
  comptrollerProxy: ComptrollerLib;
  signer: Signer;
  quantity?: BigNumberish;
  additionalAssets?: AddressLike[];
  assetsToSkip?: AddressLike[];
}

export async function buyShares({
  comptrollerProxy,
  signer,
  buyer,
  denominationAsset,
  amguValue = utils.parseEther('1'), // TODO: get real estimated amgu cost?
  investmentAmount = utils.parseEther('1'),
  minSharesAmount = investmentAmount,
}: BuySharesParams) {
  const callerDenominationAsset = denominationAsset.connect(signer);
  await callerDenominationAsset.approve(comptrollerProxy, investmentAmount);

  const callerComptrollerProxy = comptrollerProxy.connect(signer);
  return callerComptrollerProxy.buyShares
    .args(buyer, investmentAmount, minSharesAmount)
    .value(amguValue)
    .send();
}

export async function redeemShares({
  comptrollerProxy,
  signer,
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
    return comptrollerProxy
      .connect(signer)
      .redeemSharesDetailed(quantity, additionalAssets, assetsToSkip);
  }
}
