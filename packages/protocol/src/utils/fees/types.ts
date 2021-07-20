import { BigNumber } from 'ethers';

export enum FeeHook {
  Continuous = '0',
  PreBuyShares = '1',
  PostBuyShares = '2',
  PreRedeemShares = '3',
}

export enum FeeManagerActionId {
  InvokeContinuousHook,
  PayoutSharesOutstandingForFees,
}

export enum FeeSettlementType {
  None,
  Direct,
  Mint,
  Burn,
  MintSharesOutstanding,
  BurnSharesOutstanding,
}

export interface FeeSharesDueInfo {
  sharesDue: BigNumber;
  nextAggregateValueDue: BigNumber;
  nextSharePrice: BigNumber;
}
