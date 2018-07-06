import web3 from "./web3";

function newMockAddress() {
  return web3.utils.toChecksumAddress(web3.utils.randomHex(20));
}

function newMockBytes32() {
  return web3.utils.randomHex(32);
}

function newMockBytes4() {
  return web3.utils.randomHex(4);
}

export {
  newMockAddress,
  newMockBytes32,
  newMockBytes4
}
