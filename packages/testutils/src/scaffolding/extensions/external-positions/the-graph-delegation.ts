import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ExternalPositionManager } from '@enzymefinance/protocol';
import {
  ExternalPositionType,
  TheGraphDelegationPositionActionId,
  theGraphDelegationPositionDelegateArgs,
  theGraphDelegationPositionUndelegateArgs,
  theGraphDelegationPositionWithdrawArgs,
} from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

import { callOnExternalPosition, createExternalPosition } from './actions';

export async function theGraphDelegationPositionDelegate({
  comptrollerProxy,
  externalPositionManager,
  signer,
  indexer,
  tokens,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  indexer: AddressLike;
  tokens: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = theGraphDelegationPositionDelegateArgs({
    indexer,
    tokens,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: TheGraphDelegationPositionActionId.Delegate,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function theGraphDelegationPositionUndelegate({
  comptrollerProxy,
  externalPositionManager,
  signer,
  indexer,
  shares,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  indexer: AddressLike;
  shares: BigNumberish;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = theGraphDelegationPositionUndelegateArgs({
    indexer,
    shares,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: TheGraphDelegationPositionActionId.Undelegate,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function theGraphDelegationPositionWithdraw({
  comptrollerProxy,
  externalPositionManager,
  signer,
  indexer,
  nextIndexer,
  externalPositionProxy,
}: {
  comptrollerProxy: ComptrollerLib;
  externalPositionManager: ExternalPositionManager;
  signer: SignerWithAddress;
  indexer: AddressLike;
  nextIndexer: AddressLike;
  externalPositionProxy: AddressLike;
}) {
  const actionArgs = theGraphDelegationPositionWithdrawArgs({
    indexer,
    nextIndexer,
  });

  return callOnExternalPosition({
    actionArgs,
    actionId: TheGraphDelegationPositionActionId.Withdraw,
    comptrollerProxy,
    externalPositionManager,
    externalPositionProxy,
    signer,
  });
}

export async function createTheGraphDelegationPosition({
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
    externalPositionTypeId: ExternalPositionType.TheGraphDelegationPosition,
    signer,
  });
}
