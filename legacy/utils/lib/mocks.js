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

function zeroAddress() {
  return web3.utils.toChecksumAddress(`0x${'0'.repeat(20)}`);
}

export {
  newMockAddress,
  newMockBytes32,
  newMockBytes4,
  zeroAddress
}
