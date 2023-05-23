import type { BytesLike } from 'ethers';

import { contract } from '../construction';
import type { Contract } from '../contract';
import type { Call } from '../types';

interface IERC1271 extends Contract<IERC1271> {
  isValidSignature: Call<(_hash: BytesLike, _signature: BytesLike) => BytesLike, IERC1271>;
}

export const IERC1271 = contract<IERC1271>()`
  function isValidSignature(bytes32 _hash, bytes _signature) view returns (bytes4)
`;

// Returns 0x1626ba7e if signature is valid
