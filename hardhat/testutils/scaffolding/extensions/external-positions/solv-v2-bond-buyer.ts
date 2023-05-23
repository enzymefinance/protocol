import type { AddressLike } from '@enzymefinance/ethers';
import { extractEvent } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  ITestSolvV2InitialConvertibleOfferingMarket,
  SolvV2BondBuyerPositionActionId,
  solvV2BondBuyerPositionBuyOfferingArgs,
  solvV2BondBuyerPositionClaimArgs,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumber, BigNumberish } from 'ethers';
import { constants } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export async function solvV2BondBuyerPositionBuyOffering({
  comptrollerProxy,
  externalPositionManager,
  signer,
  externalPositionProxy,
  offerId,
  units,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  externalPositionProxy: AddressLike;
  offerId: BigNumberish;
  units: BigNumberish;
}) {
  const actionArgs = solvV2BondBuyerPositionBuyOfferingArgs({
    offerId,
    units,
  });

  const receipt = await callOnExternalPosition({
    actionArgs,
    actionId: SolvV2BondBuyerPositionActionId.BuyOffering,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });

  const extractedEvent = extractEvent(receipt, ITestSolvV2InitialConvertibleOfferingMarket.abi.getEvent('Traded'));
  const tokenId = extractedEvent[0].args.voucherId as BigNumber;

  return { receipt, tokenId };
}

export function solvV2BondBuyerPositionClaim({
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
  const actionArgs = solvV2BondBuyerPositionClaimArgs({
    tokenId,
    voucher,
    units,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: SolvV2BondBuyerPositionActionId.Claim,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export function createSolvV2BondBuyerPosition({
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
    externalPositionTypeId: ExternalPositionType.SolvV2BondBuyerPosition,
    initializationData: '0x',
    signer,
  });
}
