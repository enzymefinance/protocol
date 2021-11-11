import type { BigNumber } from 'ethers';

export enum FeeHook {
  Continuous = '0',
  PreBuyShares = '1',
  PostBuyShares = '2',
  PreRedeemShares = '3',
}

export enum FeeManagerActionId {
  InvokeContinuousHook = '0',
  PayoutSharesOutstandingForFees = '1',
}

export enum FeeSettlementType {
  None = '0',
  Direct = '1',
  Mint = '2',
  Burn = '3',
  MintSharesOutstanding = '4',
  BurnSharesOutstanding = '5',
}

export interface FeeSharesDueInfo {
  sharesDue: BigNumber;
  nextAggregateValueDue: BigNumber;
  nextSharePrice: BigNumber;
}
