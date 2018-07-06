import api from "./api";

const makeOrderSignature = api.util
  .abiSignature("makeOrder", [
    "address",
    "address[5]",
    "uint256[8]",
    "bytes32",
    "uint8",
    "bytes32",
    "bytes32",
  ])
  .slice(0, 10);

const takeOrderSignature = api.util
  .abiSignature("takeOrder", [
    "address",
    "address[5]",
    "uint256[8]",
    "bytes32",
    "uint8",
    "bytes32",
    "bytes32",
  ])
  .slice(0, 10);

const cancelOrderSignature = api.util
  .abiSignature("cancelOrder", [
    "address",
    "address[5]",
    "uint256[8]",
    "bytes32",
    "uint8",
    "bytes32",
    "bytes32",
  ])
  .slice(0, 10);

export {
  makeOrderSignature,
  takeOrderSignature,
  cancelOrderSignature
};
