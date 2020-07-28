import { ethers } from 'ethers';
import { FundComponents } from './setup';
import * as contracts from '../../contracts';

export interface RequestSharesParams {
  fund: FundComponents;
  requestor: contracts.SharesRequestor;
  amgu?: ethers.BigNumberish;
  amount?: ethers.BigNumberish;
  shares?: ethers.BigNumberish;
}

export function requestShares({
  fund,
  requestor,
  amgu = ethers.utils.parseEther('1'),
  amount = ethers.utils.parseEther('1'),
  shares = ethers.utils.parseEther('1'),
}: RequestSharesParams) {
  return requestor.requestShares
    .args(fund.hub, amount, shares)
    .value(amgu)
    .send();
}
