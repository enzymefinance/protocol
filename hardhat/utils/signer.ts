import type { TypedDataSigner } from '@ethersproject/abstract-signer';
import type { Signer } from 'ethers';

export interface SignerWithTypedDataSupport extends Signer, TypedDataSigner {}

export function isTypedDataSigner(signer: Signer): signer is SignerWithTypedDataSupport {
  return typeof (signer as any)._signTypedData === 'function';
}
