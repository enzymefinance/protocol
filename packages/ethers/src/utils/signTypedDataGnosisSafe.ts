import type { providers } from 'ethers';
import { utils } from 'ethers';

import type { TypedData } from './typedData';
import { getTypedDataMessage } from './typedData';

export async function signTypedDataGnosisSafe(
  provider: providers.JsonRpcProvider,
  address: string,
  data: TypedData,
): Promise<{ signature?: string; method?: string; cancelled?: boolean }> {
  const message = await getTypedDataMessage(provider, data.domain, data.types, data.value);

  // Use `eth_sign` for Gnosis Safe so that we can successfully reconstruct the dataHash
  // Todo: understand how `eth_signTypedData` works on Gnosis Safe
  try {
    const method = 'eth_sign';
    const signature = await provider.send(method, [address.toLowerCase(), utils.hexlify(utils.toUtf8Bytes(message))]);

    return { method, signature };
  } catch (error) {
    if (typeof error === 'string' && error.startsWith('Error: Transaction was rejected')) {
      return { cancelled: true };
    }

    throw new Error(typeof error === 'string' ? error : 'An error occured.');
  }
}
