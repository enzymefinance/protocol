import web3 from "./web3";

function abiEncode(name, argTypes=[]) {
  return web3.eth.abi.encodeFunctionSignature(
    `${name}(${argTypes.join(",")})`
  );
}

const makeOrderSignature = abiEncode("makeOrder", [
  "address", "address[5]", "uint256[8]", "bytes32", "uint8", "bytes32", "bytes32",
]);

const takeOrderSignature = abiEncode("takeOrder", [
  "address", "address[5]", "uint256[8]", "bytes32", "uint8", "bytes32", "bytes32",
]);

const cancelOrderSignature = abiEncode("cancelOrder", [
  "address", "address[5]", "uint256[8]", "bytes32", "uint8", "bytes32", "bytes32",
]);

const swapTokensSignature = abiEncode("swapTokens", [
  "address", "address[5]", "uint256[8]", "bytes32", "uint8", "bytes32", "bytes32",
]);


export {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature,
  swapTokensSignature
};
