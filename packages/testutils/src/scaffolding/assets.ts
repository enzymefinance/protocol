import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  IntegrationManager,
  StandardToken,
  TrackedAssetsAdapter,
  VaultLib,
} from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';
import { addTrackedAssets } from './extensions/integrations/trackedAssets';

export async function addNewAssetsToFund({
  fundOwner,
  comptrollerProxy,
  vaultProxy,
  integrationManager,
  trackedAssetsAdapter,
  assets,
  amounts = new Array(assets.length).fill(1),
}: {
  fundOwner: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  vaultProxy: VaultLib;
  integrationManager: IntegrationManager;
  trackedAssetsAdapter: TrackedAssetsAdapter;
  assets: StandardToken[];
  amounts?: BigNumberish[];
}) {
  for (const i in assets) {
    await assets[i].transfer(vaultProxy, amounts[i]);
  }
  return addTrackedAssets({
    comptrollerProxy,
    integrationManager,
    fundOwner,
    trackedAssetsAdapter,
    incomingAssets: assets,
  });
}
