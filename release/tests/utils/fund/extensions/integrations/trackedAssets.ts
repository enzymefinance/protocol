import { AddressLike } from '@crestproject/crestproject';
import { Signer } from 'ethers';
import {
  ComptrollerLib,
  IntegrationManager,
  TrackedAssetsAdapter,
} from '../../../../../utils/contracts';
import { encodeArgs } from '../../../common';
import {
  addTrackedAssetsSelector,
  callOnIntegrationArgs,
  integrationManagerActionIds,
} from './common';

export async function addTrackedAssetsArgs({
  incomingAssets,
}: {
  incomingAssets: AddressLike[];
}) {
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
  const args = await addTrackedAssetsArgs({ incomingAssets });
  const callArgs = await callOnIntegrationArgs({
    adapter: trackedAssetsAdapter,
    selector: addTrackedAssetsSelector,
    encodedCallArgs: args,
  });

  const addTrackedAssetsTx = comptrollerProxy
    .connect(fundOwner)
    .callOnExtension(
      integrationManager,
      integrationManagerActionIds.CallOnIntegration,
      callArgs,
    );
  await expect(addTrackedAssetsTx).resolves.toBeReceipt();

  return addTrackedAssetsTx;
}
