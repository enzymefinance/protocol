import web3 from "./web3";

function abiEncode(name, argTypes=[]) {
  const signatureString = `${name}(${argTypes.join(",")})`;
  return [web3.eth.abi.encodeFunctionSignature(
    signatureString
  ), signatureString];
}

const [makeOrderSignature, makeOrderSignatureString] = abiEncode("makeOrder", [
  "address", "address[6]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);

const [takeOrderSignature, takeOrderSignatureString] = abiEncode("takeOrder", [
  "address", "address[6]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);

const [cancelOrderSignature, cancelOrderSignatureString] = abiEncode("cancelOrder", [
  "address", "address[6]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);

const [swapTokensSignature, swapTokensSignatureString] = abiEncode("swapTokens", [
  "address", "address[6]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);

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

export {
  makeOrderSignature,
  makeOrderSignatureString,
  takeOrderSignature,
  takeOrderSignatureString,
  cancelOrderSignature,
  cancelOrderSignatureString,
  swapTokensSignature,
  swapTokensSignatureString,
  toBytes32,
  toBytes8
};
