import { AddressLike } from '@enzymefinance/ethers';
import { BytesLike } from 'ethers';
import { encodeArgs } from '../encoding';

export function policyManagerConfigArgs({ policies, settings }: { policies: AddressLike[]; settings: BytesLike[] }) {
  return encodeArgs(['address[]', 'bytes[]'], [policies, settings]);
}
