import { padLeft, numberToHex, stringToHex } from 'web3-utils';

export const numberToBytes = (value, numBytes) =>
  padLeft(numberToHex(value), numBytes * 2);

export const stringToBytes = (value, numBytes) =>
  padLeft(stringToHex(value), numBytes * 2);

export const encodeArgs = (encodingType, args) => {
  const hex = web3.eth.abi.encodeParameters(encodingType, args);
  return web3.utils.hexToBytes(hex);
};
