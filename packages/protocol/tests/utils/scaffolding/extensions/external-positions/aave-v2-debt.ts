import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  AaveV2DebtPositionActionId,
  aaveV2DebtPositionAddCollateralArgs,
  aaveV2DebtPositionBorrowArgs,
  aaveV2DebtPositionClaimRewardsArgs,
  aaveV2DebtPositionRemoveCollateralArgs,
  aaveV2DebtPositionRepayBorrowArgs,
  ExternalPositionType,
} from '@enzymefinance/protocol';
import type { SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export async function aaveV2DebtPositionAddCollateral({
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
  const actionArgs = aaveV2DebtPositionAddCollateralArgs({
    aTokens,
    amounts,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveV2DebtPositionActionId.AddCollateralAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function aaveV2DebtPositionBorrow({
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
  const actionArgs = aaveV2DebtPositionBorrowArgs({
    amounts,
    tokens,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveV2DebtPositionActionId.BorrowAsset,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function aaveV2DebtPositionClaimRewards({
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
  const actionArgs = aaveV2DebtPositionClaimRewardsArgs({
    assets,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveV2DebtPositionActionId.ClaimRewards,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function aaveV2DebtPositionRemoveCollateral({
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
  const actionArgs = aaveV2DebtPositionRemoveCollateralArgs({
    aTokens,
    amounts,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveV2DebtPositionActionId.RemoveCollateralAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function aaveV2DebtPositionRepayBorrow({
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
  const actionArgs = aaveV2DebtPositionRepayBorrowArgs({
    amounts,
    tokens,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: AaveV2DebtPositionActionId.RepayBorrowedAssets,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function createAaveV2DebtPosition({
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
    externalPositionTypeId: ExternalPositionType.AaveV2DebtPosition,
    signer,
  });
}
