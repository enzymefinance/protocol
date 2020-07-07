import { FundComponents } from '~/framework/fund';
import { contracts } from '~/framework';
import { ethers } from 'ethers';

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
  return requestor.requestShares(fund.hub, amount, shares).send({
    value: amgu,
  });
}
