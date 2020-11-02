import { AddressLike } from '@crestproject/crestproject';
import { BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export function feeManagerConfigArgs({ fees, settings }: { fees: AddressLike[]; settings: BytesLike[] }) {
  return encodeArgs(['address[]', 'bytes[]'], [fees, settings]);
}
