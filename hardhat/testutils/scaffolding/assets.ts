import type { AddressLike } from '@enzymefinance/ethers';
import type { ComptrollerLib, IntegrationManager } from '@enzymefinance/protocol';
import { ITestStandardToken } from '@enzymefinance/protocol';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/testutils';
import { getAssetUnit } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

import { setAccountBalance } from '../accounts';
import { addTrackedAssetsToVault } from './extensions/integrations/trackedAssets';

export async function addNewAssetsToFund({
  signer,
  comptrollerProxy,
  integrationManager,
  assets,
  amounts,
  provider,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  assets: AddressLike[];
  amounts?: BigNumberish[];
  provider: EthereumTestnetProvider;
}) {
  if (amounts === undefined) {
    amounts = await Promise.all(assets.map(async (asset) => getAssetUnit(new ITestStandardToken(asset, provider))));
  }

  // First, add tracked assets
  const receipt = addTrackedAssetsToVault({
    assets,
    comptrollerProxy,
    integrationManager,
    signer,
  });

  // Then seed the vault with balances as necessary
  const vaultProxy = await comptrollerProxy.getVaultProxy();

  await Promise.all(
    amounts.map((amount, i) => setAccountBalance({ account: vaultProxy, amount, provider, token: assets[i] })),
  );

  return receipt;
}
