import type { BytesLike } from 'ethers';
import { utils } from 'ethers';

const errorSelector = '0x08c379a0';

function unwrapRevertReason(data: BytesLike) {
  let bytes = utils.arrayify(data);

  // Unwrap nested `Error(string)` encoded data by looking ahead for other `Error(string)` selectors.
  if (utils.hexlify(bytes.slice(0, 4)) === errorSelector) {
    while (utils.hexlify(bytes.slice(68, 72)) === errorSelector) {
      bytes = bytes.slice(68);
    }
  }

  return bytes;
}

export function decodeRevertReason(data: BytesLike) {
  const bytes = unwrapRevertReason(data);
  const selector = utils.hexlify(bytes.slice(0, 4));

  if (selector === errorSelector) {
    return utils.defaultAbiCoder.decode(['string'], bytes.slice(4))[0] as string;
  }

  return utils.toUtf8String(data);
}
