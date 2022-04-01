import type { AddressLike } from '@enzymefinance/ethers';
import { resolveAddress } from '@enzymefinance/ethers';
import type { EthereumTestnetProvider, SignerWithAddress } from '@enzymefinance/hardhat';

import { sendEthBySelfDestruct } from './helpers';

export async function impersonateContractSigner({
  contractAddress,
  ethSeeder,
  provider,
}: {
  contractAddress: AddressLike;
  ethSeeder: SignerWithAddress;
  provider: EthereumTestnetProvider;
}) {
  await sendEthBySelfDestruct({ recipient: contractAddress, signer: ethSeeder });

  return impersonateSigner({
    provider,
    signerAddress: contractAddress,
  });
}

export async function impersonateSigner({
  signerAddress,
  provider,
}: {
  signerAddress: AddressLike;
  provider: EthereumTestnetProvider;
}) {
  await provider.send('hardhat_impersonateAccount', [signerAddress]);

  return provider.getSignerWithAddress(resolveAddress(signerAddress));
}
