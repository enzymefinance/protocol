import { AddressLike, Contract, Send } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib } from '@enzymefinance/protocol';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';

// prettier-ignore
export interface DenominationAssetInterface extends Contract<any> {
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean, any>;
}

export interface BuySharesParams {
  comptrollerProxy: ComptrollerLib;
  signer: SignerWithAddress;
  buyers: AddressLike[];
  denominationAsset: DenominationAssetInterface;
  investmentAmounts?: BigNumberish[];
  minSharesAmounts?: BigNumberish[];
}

export interface RedeemSharesParams {
  comptrollerProxy: ComptrollerLib;
  signer: SignerWithAddress;
  quantity?: BigNumberish;
  additionalAssets?: AddressLike[];
  assetsToSkip?: AddressLike[];
}

export async function buyShares({
  comptrollerProxy,
  signer,
  buyers,
  denominationAsset,
  investmentAmounts = new Array(buyers.length).fill(utils.parseEther('1')),
  minSharesAmounts = investmentAmounts,
}: BuySharesParams) {
  const totalInvestmentAmount = investmentAmounts.reduce(
    (total: BigNumber, amount) => total.add(amount),
    constants.Zero,
  );

  const callerDenominationAsset = denominationAsset.connect(signer);
  await callerDenominationAsset.approve(comptrollerProxy, totalInvestmentAmount);

  const callerComptrollerProxy = comptrollerProxy.connect(signer);
  return callerComptrollerProxy.buyShares(buyers, investmentAmounts, minSharesAmounts);
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
    return comptrollerProxy.connect(signer).redeemSharesDetailed(quantity, additionalAssets, assetsToSkip);
  }
}
