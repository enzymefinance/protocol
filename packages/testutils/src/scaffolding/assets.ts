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
  setAsPersistentlyTracked,
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
    setAsPersistentlyTracked,
  });

  // Then seed the vault with balances
  const vaultProxy = await comptrollerProxy.getVaultProxy();
  for (const i in assets) {
    if (amounts[i] > 0) {
      await assets[i].transfer(vaultProxy, amounts[i]);
    }
  }

  return receipt;
}
