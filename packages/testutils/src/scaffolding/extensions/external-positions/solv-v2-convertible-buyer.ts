import type { AddressLike } from '@enzymefinance/ethers';
import { extractEvent } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  ITestSolvV2InitialConvertibleOfferingMarket,
  SolvV2ConvertibleBuyerPositionActionId,
  solvV2ConvertibleBuyerPositionBuyOfferingArgs,
  solvV2ConvertibleBuyerPositionBuySaleByAmountArgs,
  solvV2ConvertibleBuyerPositionBuySaleByUnitsArgs,
  solvV2ConvertibleBuyerPositionClaimArgs,
  solvV2ConvertibleBuyerPositionCreateSaleDecliningPriceArgs,
  solvV2ConvertibleBuyerPositionCreateSaleFixedPriceArgs,
  solvV2ConvertibleBuyerPositionRemoveSaleArgs,
} from '@enzymefinance/protocol';
import type { BigNumber, BigNumberish } from 'ethers';
import { constants } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export async function solvV2ConvertibleBuyerPositionBuyOffering({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  offerId,
  units,
  voucher,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  offerId: BigNumberish;
  units: BigNumberish;
  voucher: AddressLike;
}) {
  const actionArgs = solvV2ConvertibleBuyerPositionBuyOfferingArgs({
    voucher,
    offerId,
    units,
  });

  const receipt = await callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleBuyerPositionActionId.BuyOffering,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });

  const extractedEvent = extractEvent(receipt, ITestSolvV2InitialConvertibleOfferingMarket.abi.getEvent('Traded'));
  const tokenId = extractedEvent[0].args.voucherId as BigNumber;

  return { receipt, tokenId };
}

export function solvV2ConvertibleBuyerPositionBuySaleByAmount({
  comptrollerProxy,
  externalPositionManager,
  signer,
  amount,
  externalPositionProxy,
  saleId,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  amount: BigNumberish;
  externalPositionProxy: AddressLike;
  saleId: BigNumberish;
}) {
  const actionArgs = solvV2ConvertibleBuyerPositionBuySaleByAmountArgs({
    amount,
    saleId,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleBuyerPositionActionId.BuySaleByAmount,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function solvV2ConvertibleBuyerPositionBuySaleByUnits({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  saleId,
  units,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  saleId: BigNumberish;
  units: BigNumberish;
}) {
  const actionArgs = solvV2ConvertibleBuyerPositionBuySaleByUnitsArgs({
    saleId,
    units,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleBuyerPositionActionId.BuySaleByUnits,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function solvV2ConvertibleBuyerPositionClaim({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  tokenId,
  voucher,
  units = constants.MaxUint256,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  tokenId: BigNumberish;
  voucher: AddressLike;
  units?: BigNumberish;
}) {
  const actionArgs = solvV2ConvertibleBuyerPositionClaimArgs({
    tokenId,
    voucher,
    units,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleBuyerPositionActionId.Claim,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function solvV2ConvertibleBuyerPositionCreateSaleDecliningPrice({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  voucher,
  tokenId,
  currency,
  min,
  max,
  startTime,
  useAllowList,
  highest,
  lowest,
  duration,
  interval,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  voucher: AddressLike;
  tokenId: BigNumberish;
  currency: AddressLike;
  min: BigNumberish;
  max: BigNumberish;
  startTime: BigNumberish;
  useAllowList: boolean;
  highest: BigNumberish;
  lowest: BigNumberish;
  duration: BigNumberish;
  interval: BigNumberish;
}) {
  const actionArgs = solvV2ConvertibleBuyerPositionCreateSaleDecliningPriceArgs({
    voucher,
    tokenId,
    currency,
    min,
    max,
    startTime,
    useAllowList,
    highest,
    lowest,
    duration,
    interval,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleBuyerPositionActionId.CreateSaleDecliningPrice,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function solvV2ConvertibleBuyerPositionCreateSaleFixedPrice({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  voucher,
  tokenId,
  currency,
  min,
  max,
  startTime,
  useAllowList,
  price,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  voucher: AddressLike;
  tokenId: BigNumberish;
  currency: AddressLike;
  min: BigNumberish;
  max: BigNumberish;
  startTime: BigNumberish;
  useAllowList: boolean;
  price: BigNumberish;
}) {
  const actionArgs = solvV2ConvertibleBuyerPositionCreateSaleFixedPriceArgs({
    voucher,
    tokenId,
    currency,
    min,
    max,
    startTime,
    useAllowList,
    price,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleBuyerPositionActionId.CreateSaleFixedPrice,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function solvV2ConvertibleBuyerPositionReconcile({
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
    actionId: SolvV2ConvertibleBuyerPositionActionId.Reconcile,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function solvV2ConvertibleBuyerPositionRemoveSale({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  saleId,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  saleId: BigNumberish;
}) {
  const actionArgs = solvV2ConvertibleBuyerPositionRemoveSaleArgs({
    saleId,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2ConvertibleBuyerPositionActionId.RemoveSale,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function createSolvV2ConvertibleBuyerPosition({
  comptrollerProxy,
  externalPositionManager,
  signer,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
}) {
  return createExternalPosition({
    comptrollerProxy,
    externalPositionManager,
    externalPositionTypeId: ExternalPositionType.SolvV2ConvertibleBuyerPosition,
    initializationData: '0x',
    signer,
  });
}
