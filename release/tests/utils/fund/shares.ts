import { BigNumberish, Signer, utils } from 'ethers';
import { AddressLike, Contract, Send } from '@crestproject/crestproject';
import * as contracts from '../../../utils/contracts';

// prettier-ignore
export interface DenominationAssetInterface extends Contract {
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean, DenominationAssetInterface>;
}

export interface BuySharesParams {
  comptrollerProxy: contracts.ComptrollerLib;
  signer: Signer;
  buyer: AddressLike;
  denominationAsset: DenominationAssetInterface;
  amguValue?: BigNumberish;
  investmentAmount?: BigNumberish;
  minSharesAmount?: BigNumberish;
}

export interface RedeemSharesParams {
  comptrollerProxy: contracts.ComptrollerLib;
  signer: Signer;
  quantity?: BigNumberish;
  bypassFailure?: boolean;
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
  bypassFailure = false,
}: RedeemSharesParams) {
  if (quantity == undefined) {
    if (bypassFailure) {
      return comptrollerProxy.connect(signer).redeemSharesEmergency();
    }
    return comptrollerProxy.connect(signer).redeemShares();
  } else {
    if (bypassFailure) {
      throw 'Cannot pass both bypassFailure and specify a quantity to redeemShares';
    }
    return comptrollerProxy.connect(signer).redeemSharesQuantity(quantity);
  }
}
