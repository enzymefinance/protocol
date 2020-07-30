import { BigNumberish, utils } from 'ethers';
import { AddressLike, Contract, Send } from '@crestproject/crestproject';
import { FundComponents } from './setup';
import * as contracts from '../../contracts';

// prettier-ignore
export interface DemoninationAssetInterface extends Contract {
  approve: Send<(spender: AddressLike, amount: BigNumberish) => boolean, DemoninationAssetInterface>;
}

export interface RequestSharesParams {
  denominationAsset: DemoninationAssetInterface;
  fundComponents: FundComponents;
  sharesRequestor: contracts.SharesRequestor;
  amguValue?: BigNumberish;
  investmentAmount?: BigNumberish;
  sharesAmount?: BigNumberish;
}

export async function requestShares({
  denominationAsset,
  fundComponents,
  sharesRequestor,
  amguValue = utils.parseEther('1'),
  investmentAmount = utils.parseEther('1'),
  sharesAmount = utils.parseEther('1'),
}: RequestSharesParams) {
  await denominationAsset.approve(sharesRequestor, investmentAmount);

  return sharesRequestor.requestShares
    .args(fundComponents.hub, investmentAmount, sharesAmount)
    .value(amguValue)
    .send();
}
