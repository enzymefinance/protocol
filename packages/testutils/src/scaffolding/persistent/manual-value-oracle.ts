import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ManualValueOracleFactory } from '@enzymefinance/protocol';
import { ManualValueOracleLib } from '@enzymefinance/protocol';

import { assertEvent } from '../../assertions';

export async function deployManualValueOracle({
  signer,
  manualValueOracleFactory,
  owner,
  updater,
  description = '',
}: {
  signer: SignerWithAddress;
  manualValueOracleFactory: ManualValueOracleFactory;
  owner: AddressLike;
  updater: AddressLike;
  description?: string;
}) {
  const receipt = await manualValueOracleFactory.connect(signer).deploy(owner, updater, description);

  // Get the deployed proxy via the validated event
  const proxyDeployedArgs = assertEvent(receipt, 'ProxyDeployed', {
    caller: signer,
    proxy: expect.any(String) as string,
  });
  const proxy = new ManualValueOracleLib(proxyDeployedArgs.proxy, provider);

  return { proxy, receipt };
}
