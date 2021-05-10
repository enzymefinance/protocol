import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, IntegrationManager, StandardToken } from '@enzymefinance/protocol';
import { BigNumberish } from 'ethers';
import { addTrackedAssetsToVault } from './extensions/integrations/trackedAssets';

export async function addNewAssetsToFund({
  signer,
  comptrollerProxy,
  integrationManager,
  assets,
  amounts = new Array(assets.length).fill(1),
  setAsPersistentlyTracked = new Array(assets.length).fill(true),
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  assets: StandardToken[];
  amounts?: BigNumberish[];
  setAsPersistentlyTracked?: boolean[];
}) {
  // First, add tracked assets while their balances are 0
  const receipt = addTrackedAssetsToVault({
    signer,
    comptrollerProxy,
    integrationManager,
    assets,
  });

  // Then seed the vault with balances and unset persistently tracked assets as necessary
  const vaultProxy = await comptrollerProxy.getVaultProxy();
  for (const i in assets) {
    if (amounts[i] > 0) {
      await assets[i].transfer(vaultProxy, amounts[i]);
    }
    if (!setAsPersistentlyTracked[i]) {
      await comptrollerProxy.allowUntrackingAssets([assets[i]]);
    }
  }

  return receipt;
}
