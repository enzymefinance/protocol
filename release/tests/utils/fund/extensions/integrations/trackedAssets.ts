import { Signer } from 'ethers';
import { AddressLike } from '@crestproject/crestproject';
import {
  TrackedAssetsAdapter,
  ComptrollerLib,
  IntegrationManager,
} from '../../../../../utils/contracts';
import { encodeArgs } from '../../../common';
import {
  callOnIntegrationArgs,
  callOnIntegrationSelector,
  addTrackedAssetsSelector,
} from './common';

export async function addTrackedAssetsArgs(incomingAssets: AddressLike[]) {
  return encodeArgs(['address[]'], [incomingAssets]);
}

export async function addTrackedAssets({
  comptrollerProxy,
  integrationManager,
  fundOwner,
  trackedAssetsAdapter,
  incomingAssets,
}: {
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  fundOwner: Signer;
  trackedAssetsAdapter: TrackedAssetsAdapter;
  incomingAssets: AddressLike[];
}) {
  const args = await addTrackedAssetsArgs(incomingAssets);
  const callArgs = await callOnIntegrationArgs(
    trackedAssetsAdapter,
    addTrackedAssetsSelector,
    args,
  );

  const addTrackedAssetsTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(integrationManager, callOnIntegrationSelector, callArgs);
  await expect(addTrackedAssetsTx).resolves.toBeReceipt();

  return addTrackedAssetsTx;
}
