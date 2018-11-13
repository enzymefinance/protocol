import web3 from "./web3";

function joinSignature(name, argTypes=[]) {
    return `${name}(${argTypes.join(",")})`
}

function abiEncode(joinedSignature) {
  return web3.eth.abi.encodeFunctionSignature(joinedSignature);
}

export const makeOrderSignature = joinSignature("makeOrder", [
  "address", "address[6]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);
export const takeOrderSignature = joinSignature("takeOrder", [
  "address", "address[6]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);
export const cancelOrderSignature = joinSignature("cancelOrder", [
  "address", "address[6]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);
export const swapTokensSignature = joinSignature("swapTokens", [
  "address", "address[6]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);

export const makeOrderSignatureBytes = abiEncode(makeOrderSignature);
export const takeOrderSignatureBytes = abiEncode(takeOrderSignature);
export const cancelOrderSignatureBytes = abiEncode(cancelOrderSignature);
export const swapTokensSignatureBytes = abiEncode(swapTokensSignature);

function toBytes32(input) {
  return toBytesN(input, 32);
}

function toBytes8(input) {
  return toBytesN(input, 8);
}

function toBytesN(input, numBytes) {
  const hexLength = numBytes * 2;   // 1 byte = 2 hex chars
  const hexString = web3.utils.toHex(input);
  if (hexString.length - 2 > hexLength) // subtract "0x" from beginning
    throw new Error(`Data too large to encode into ${numBytes} bytes`);
  else
    return web3.utils.padLeft(hexString, hexLength);
}

function toBytes32(input) {
  return toBytesN(input, 32);
}

function toBytes8(input) {
  return toBytesN(input, 8);
}

export {
  toBytes32,
  toBytes8,
  abiEncode
};
