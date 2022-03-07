import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  AaveDebtPositionActionId,
  aaveDebtPositionAddCollateralArgs,
  aaveDebtPositionBorrowArgs,
  aaveDebtPositionClaimStkAaveArgs,
  aaveDebtPositionRemoveCollateralArgs,
  aaveDebtPositionRepayBorrowArgs,
  ExternalPositionType,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export async function aaveDebtPositionAddCollateral({
  comptrollerProxy,
  externalPositionManager,
  signer,
  aTokens,
  amounts,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  aTokens: AddressLike[];
  amounts: BigNumberish[];
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = aaveDebtPositionAddCollateralArgs({
    aTokens,
    amounts,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveDebtPositionActionId.AddCollateralAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function aaveDebtPositionBorrow({
  comptrollerProxy,
  externalPositionManager,
  signer,
  tokens,
  amounts,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  tokens: AddressLike[];
  amounts: BigNumberish[];
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = aaveDebtPositionBorrowArgs({
    amounts,
    tokens,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveDebtPositionActionId.BorrowAsset,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function aaveDebtPositionClaimStkAave({
  comptrollerProxy,
  externalPositionManager,
  signer,
  assets,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  assets: AddressLike[];
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = aaveDebtPositionClaimStkAaveArgs({
    assets,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveDebtPositionActionId.ClaimRewards,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function aaveDebtPositionRemoveCollateral({
  comptrollerProxy,
  externalPositionManager,
  signer,
  aTokens,
  amounts,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  aTokens: AddressLike[];
  amounts: BigNumberish[];
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = aaveDebtPositionRemoveCollateralArgs({
    aTokens,
    amounts,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveDebtPositionActionId.RemoveCollateralAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function aaveDebtPositionRepayBorrow({
  comptrollerProxy,
  externalPositionManager,
  signer,
  tokens,
  amounts,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  tokens: AddressLike[];
  amounts: BigNumberish[];
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = aaveDebtPositionRepayBorrowArgs({
    amounts,
    tokens,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveDebtPositionActionId.RepayBorrowedAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function createAaveDebtPosition({
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
    externalPositionTypeId: ExternalPositionType.AaveDebtPosition,
    signer,
  });
}
