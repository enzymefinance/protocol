import type { providers } from 'ethers';
import { utils } from 'ethers';

import { IERC1271 } from '../contracts/IERC1271';
import { sameAddress } from './sameAddress';
import type { TypedData } from './typedData';

interface VerifySignatureProps {
  walletAddress: string;
  message: TypedData | string;
  signature: string;
  provider: providers.StaticJsonRpcProvider;
}

export async function verifySignature({
  walletAddress,
  message,
  signature,
  provider,
}: VerifySignatureProps): Promise<boolean> {
  try {
    const bytecode = await provider.getCode(walletAddress);
    const isSmartContract = bytecode && utils.hexStripZeros(bytecode) !== '0x';

    if (isSmartContract) {
      const hash =
        typeof message === 'string'
          ? utils.hashMessage(message)
          : utils._TypedDataEncoder.hash(message.domain, message.types, message.value);
      const contract = new IERC1271(walletAddress, provider);
      const result = await contract.isValidSignature(hash, signature);

      // Per https://eips.ethereum.org/EIPS/eip-1271
      return result === '0x1626ba7e';
    }

    const recoveredAddress =
      typeof message === 'string'
        ? utils.verifyMessage(message, signature)
        : utils.verifyTypedData(message.domain, message.types, message.value, signature);

    return sameAddress(recoveredAddress, walletAddress);
  } catch {
    return false;
  }
}
