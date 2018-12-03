import * as Abi from 'web3-eth-abi';

function joinSignature(name, argTypes = []) {
  return `${name}(${argTypes.join(',')})`;
}

function abiEncode(joinedSignature) {
  return Abi.encodeFunctionSignature(joinedSignature);
}

export const makeOrderSignature = joinSignature('makeOrder', [
  'address',
  'address[6]',
  'uint256[8]',
  'bytes32',
  'bytes',
  'bytes',
  'bytes',
]);
export const takeOrderSignature = joinSignature('takeOrder', [
  'address',
  'address[6]',
  'uint256[8]',
  'bytes32',
  'bytes',
  'bytes',
  'bytes',
]);
export const cancelOrderSignature = joinSignature('cancelOrder', [
  'address',
  'address[6]',
  'uint256[8]',
  'bytes32',
  'bytes',
  'bytes',
  'bytes',
]);
export const withdrawTokensSignature = joinSignature('withdrawTokens', [
  'address',
  'address[6]',
  'uint256[8]',
  'bytes32',
  'bytes',
  'bytes',
  'bytes',
]);

export const makeOrderSignatureBytes = abiEncode(makeOrderSignature);
export const takeOrderSignatureBytes = abiEncode(takeOrderSignature);
export const cancelOrderSignatureBytes = abiEncode(cancelOrderSignature);
export const withdrawTokensSignatureBytes = abiEncode(withdrawTokensSignature);
