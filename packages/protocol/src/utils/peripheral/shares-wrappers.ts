import type { BigNumberish } from 'ethers';
import { utils } from 'ethers';

export enum ArbitraryTokenPhasedSharesWrapperState {
  Deposit = '0',
  Locked = '1',
  Redeem = '2',
}

export enum GatedRedemptionQueueSharesWrapperDepositMode {
  Direct = '0',
  Request = '1',
}

export interface GatedRedemptionQueueSharesWrapperRedemptionWindowConfig {
  firstWindowStart: BigNumberish;
  frequency: BigNumberish;
  duration: BigNumberish;
  relativeSharesCap: BigNumberish;
}

export const GatedRedemptionQueueSharesWrapperRedemptionWindowConfigTuple = utils.ParamType.fromString(
  `tuple(uint64 firstWindowStart, uint32 frequency, uint32 duration, uint64 relativeSharesCap)`,
);

export const gatedRedemptionQueueSharesWrapperNativeAssetAddress = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
