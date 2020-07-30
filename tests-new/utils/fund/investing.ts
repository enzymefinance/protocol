import { ethers } from 'ethers';
import { FundComponents } from './setup';
import * as contracts from '../../contracts';

export interface RequestSharesParams {
  denominationAsset: contracts.ERC20;
  fundComponents: FundComponents;
  sharesRequestor: contracts.SharesRequestor;
  amguValue?: ethers.BigNumberish;
  investmentAmount?: ethers.BigNumberish;
  sharesAmount?: ethers.BigNumberish;
}

export async function requestShares({
  denominationAsset,
  fundComponents,
  sharesRequestor,
  amguValue = ethers.utils.parseEther('1'),
  investmentAmount = ethers.utils.parseEther('1'),
  sharesAmount = ethers.utils.parseEther('1'),
}: RequestSharesParams) {
  await denominationAsset.approve(sharesRequestor, investmentAmount);

  return sharesRequestor.requestShares
    .args(fundComponents.hub, investmentAmount, sharesAmount)
    .value(amguValue)
    .send();
}
