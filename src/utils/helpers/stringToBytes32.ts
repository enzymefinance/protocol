import * as Web3Utils from 'web3-utils';
import { ensure } from '~/utils/guards/ensure';

const stringToBytes = (inputString: string, numBytes: number) => {
  const numChars = numBytes * 2; // characters needed to encode numBytes
  ensure(
    inputString.length <= numChars,
    `String too long to encode with ${numBytes} bytes`,
  );
  return Web3Utils.padLeft(Web3Utils.stringToHex(inputString), numChars);
};

export const stringToBytes32 = (input: string) => stringToBytes(input, 32);
