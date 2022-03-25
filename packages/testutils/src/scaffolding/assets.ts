import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, IntegrationManager, StandardToken } from '@enzymefinance/protocol';
import type { BigNumberish } from 'ethers';

import { addTrackedAssetsToVault } from './extensions/integrations/trackedAssets';

export async function addNewAssetsToFund({
  signer,
  comptrollerProxy,
  integrationManager,
  assets,
  amounts = new Array(assets.length).fill(1),
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  assets: StandardToken[];
  amounts?: BigNumberish[];
}) {
  // First, add tracked assets
  const receipt = addTrackedAssetsToVault({
    assets,
    comptrollerProxy,
    integrationManager,
    signer,
  });

  // Then seed the vault with balances as necessary
  const vaultProxy = await comptrollerProxy.getVaultProxy();

  for (const i in assets) {
    if (amounts[i] > 0) {
      await assets[i].transfer(vaultProxy, amounts[i]);
    }
  }

  return receipt;
}
