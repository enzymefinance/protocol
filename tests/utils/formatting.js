import { ENCODING_TYPES } from '~/utils/constants';
import { padLeft, numberToHex, stringToHex } from 'web3-utils';

export const numberToBytes = (value, numBytes) =>
  padLeft(numberToHex(value), numBytes * 2);

export const stringToBytes = (value, numBytes) =>
  padLeft(stringToHex(value), numBytes * 2);

// NOTE: Uncomment if we need this, but might not be necessary
// export const stringifyStruct = (obj) => {
//   const pairs = Object.keys(obj).map(key => [key, `${obj[key]}`]);
//   const stringifiedStruct = {};
//   for (const [key, value] of pairs) stringifiedStruct[key] = value;
//   return stringifiedStruct;
// };

export const encodeArgs = (encodingType, args) => {
  const hex = web3.eth.abi.encodeParameters(encodingType, args);
  return web3.utils.hexToBytes(hex);
};

export const encodeTakeOrderArgs = ({
  makerAsset,
  makerQuantity,
  takerAsset,
  takerQuantity,
}) => {
  const args = [makerAsset, makerQuantity, takerAsset, takerQuantity];
  return encodeArgs(ENCODING_TYPES.MINIMAL, args);
};
