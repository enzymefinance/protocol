import { BigNumber } from 'ethers';

export enum FeeHook {
  Continuous,
  BuySharesSetup,
  PreBuyShares,
  PostBuyShares,
  BuySharesCompleted,
  PreRedeemShares,
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
