import type { ComptrollerLib, IntegrationManager, ITestStandardToken } from '@enzymefinance/protocol';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';

import { setAccountBalance } from '../accounts';
import { addTrackedAssetsToVault } from './extensions/integrations/trackedAssets';

export async function addNewAssetsToFund({
  signer,
  comptrollerProxy,
  integrationManager,
  assets,
  amounts = new Array(assets.length).fill(1),
  provider,
}: {
  signer: SignerWithAddress;
  comptrollerProxy: ComptrollerLib;
  integrationManager: IntegrationManager;
  assets: ITestStandardToken[];
  amounts?: BigNumberish[];
  provider: EthereumTestnetProvider;
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

  await Promise.all(
    assets.map((asset, i) => setAccountBalance({ account: vaultProxy, amount: amounts[i], provider, token: asset })),
  );

  return receipt;
}
