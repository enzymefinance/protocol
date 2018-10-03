import web3 from "./web3";

function abiEncode(name, argTypes=[]) {
  return web3.eth.abi.encodeFunctionSignature(
    `${name}(${argTypes.join(",")})`
  );
}

const makeOrderSignature = abiEncode("makeOrder", [
  "address", "address[4]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);

const takeOrderSignature = abiEncode("takeOrder", [
  "address", "address[4]", "uint256[8]", "bytes32", "bytes", "bytes", "bytes",
]);

const cancelOrderSignature = abiEncode("cancelOrder", [
  "address", "address[5]", "uint256[8]", "bytes32", "uint8", "bytes32", "bytes32",
]);

const swapTokensSignature = abiEncode("swapTokens", [
  "address", "address[5]", "uint256[8]", "bytes32", "uint8", "bytes32", "bytes32",
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
  takeOrderSignature,
  cancelOrderSignature,
  swapTokensSignature,
  toBytes32,
  toBytes8
};
