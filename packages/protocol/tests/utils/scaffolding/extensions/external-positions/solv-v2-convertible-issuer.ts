import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  SolvV2ConvertibleIssuerPositionActionId,
  solvV2ConvertibleIssuerPositionCreateOfferArgs,
  solvV2ConvertibleIssuerPositionRefundArgs,
  solvV2ConvertibleIssuerPositionRemoveOfferArgs,
  solvV2ConvertibleIssuerPositionWithdrawArgs,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export interface SolvV2ConvertibleIssuerPositionCreateOfferParams {
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

export async function solvV2ConvertibleIssuerPositionCreateOffer({
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
}: SolvV2ConvertibleIssuerPositionCreateOfferParams) {
  const actionArgs = solvV2ConvertibleIssuerPositionCreateOfferArgs({
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
    actionId: SolvV2ConvertibleIssuerPositionActionId.CreateOffer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function solvV2ConvertibleIssuerPositionReconcile({
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
    actionId: SolvV2ConvertibleIssuerPositionActionId.Reconcile,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function solvV2ConvertibleIssuerPositionRefund({
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
  const actionArgs = solvV2ConvertibleIssuerPositionRefundArgs({ voucher, slotId });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleIssuerPositionActionId.Refund,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function solvV2ConvertibleIssuerPositionRemoveOffer({
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
  const actionArgs = solvV2ConvertibleIssuerPositionRemoveOfferArgs({ offerId });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleIssuerPositionActionId.RemoveOffer,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function solvV2ConvertibleIssuerPositionWithdraw({
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
  const actionArgs = solvV2ConvertibleIssuerPositionWithdrawArgs({ voucher, slotId });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleIssuerPositionActionId.Withdraw,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function createSolvV2ConvertibleIssuerPosition({
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
    externalPositionTypeId: ExternalPositionType.SolvV2ConvertibleIssuerPosition,
    signer,
  });
}
