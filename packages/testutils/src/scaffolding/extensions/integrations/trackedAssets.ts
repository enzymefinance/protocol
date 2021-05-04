import { AddressLike } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  addTrackedAssetsToVaultArgs,
  ComptrollerLib,
  IntegrationManager,
  IntegrationManagerActionId,
  removeTrackedAssetsFromVaultArgs,
} from '@enzymefinance/protocol';

export function addTrackedAssetsToVault({
  signer,
  comptrollerProxy,
  integrationManager,
  assets,
  setAsPersistentlyTracked = new Array(assets.length).fill(true),
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  assets: AddressLike[];
  setAsPersistentlyTracked?: boolean[];
}) {
  return comptrollerProxy
    .connect(signer)
    .callOnExtension(
      integrationManager,
      IntegrationManagerActionId.AddTrackedAssetsToVault,
      addTrackedAssetsToVaultArgs({ assets, setAsPersistentlyTracked }),
    );
}

export function removeTrackedAssetsFromVault({
  signer,
  comptrollerProxy,
  integrationManager,
  assets,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  assets: AddressLike[];
}) {
  return comptrollerProxy
    .connect(signer)
    .callOnExtension(
      integrationManager,
      IntegrationManagerActionId.RemoveTrackedAssetsFromVault,
      removeTrackedAssetsFromVaultArgs({ assets }),
    );
}
