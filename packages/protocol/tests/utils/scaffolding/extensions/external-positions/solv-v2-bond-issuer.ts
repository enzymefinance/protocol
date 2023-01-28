import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  SolvV2BondIssuerPositionActionId,
  solvV2BondIssuerPositionCreateOfferArgs,
  solvV2BondIssuerPositionRefundArgs,
  solvV2BondIssuerPositionRemoveOfferArgs,
  solvV2BondIssuerPositionWithdrawArgs,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export interface SolvV2BondIssuerPositionCreateOfferParams {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  voucher: AddressLike;
  currency: AddressLike;
  min: BigNumberish;
  max: BigNumberish;
  startTime: BigNumberish;
  endTime: BigNumberish;
  useAllowList: boolean;
  priceType: BigNumberish;
  priceData: BytesLike;
  mintParameter: {
    lowestPrice: BigNumberish;
    highestPrice: BigNumberish;
    tokenInAmount: BigNumberish;
    effectiveTime: BigNumberish;
    maturity: BigNumberish;
  };
}

export async function solvV2BondIssuerPositionCreateOffer({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  voucher,
  currency,
  min,
  max,
  startTime,
  endTime,
  useAllowList,
  priceType,
  priceData,
  mintParameter,
}: SolvV2BondIssuerPositionCreateOfferParams) {
  const actionArgs = solvV2BondIssuerPositionCreateOfferArgs({
    currency,
    endTime,
    max,
    min,
    mintParameter,
    priceData,
    priceType,
    startTime,
    useAllowList,
    voucher,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2BondIssuerPositionActionId.CreateOffer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function solvV2BondIssuerPositionReconcile({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
}) {
  return callOnExternalPosition({
    actionArgs: '0x',
    actionId: SolvV2BondIssuerPositionActionId.Reconcile,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function solvV2BondIssuerPositionRefund({
  comptrollerProxy,
  externalPositionManager,
  signer,
  voucher,
  slotId,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  voucher: AddressLike;
  slotId: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = solvV2BondIssuerPositionRefundArgs({ voucher, slotId });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2BondIssuerPositionActionId.Refund,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function solvV2BondIssuerPositionRemoveOffer({
  comptrollerProxy,
  externalPositionManager,
  signer,
  offerId,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  offerId: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = solvV2BondIssuerPositionRemoveOfferArgs({ offerId });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2BondIssuerPositionActionId.RemoveOffer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function solvV2BondIssuerPositionWithdraw({
  comptrollerProxy,
  externalPositionManager,
  signer,
  voucher,
  slotId,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  voucher: AddressLike;
  slotId: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = solvV2BondIssuerPositionWithdrawArgs({ voucher, slotId });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2BondIssuerPositionActionId.Withdraw,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function createSolvV2BondIssuerPosition({
  signer,
  comptrollerProxy,
  externalPositionManager,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
}) {
  return createExternalPosition({
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.SolvV2BondIssuerPosition,
    signer,
  });
}
