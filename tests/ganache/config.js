const ethers = require('ethers');
const addresses = require('../../config');

const forkPort = process.env.GANACHE_FORK_PORT || 8545;
const forkStartingBalance = ethers.utils.parseEther('10000000').toString();
const forkPrivateKeys = [
  '0xd3fdff38aaf7be159fc1c12c66982fea997df08ca5b91b399e437370d3681721',
  '0x9cc70449981c6df178133db4c075c408876e8be3b147fa11f8ee947faa0b0011',
  '0x53f76b9ee429500aacf3730228ab4fdc72683e952b48a8c4a923c04203d93a56',
  '0x1a4b1a2941ef98ab3e8aa83572bc81d8fe178a2d21ee42b888fd0597848746de',
  '0xb5556102fef8ffc4e044cd6708039787ed97bb5860fd1bff2fcac88d77ff70eb',
  '0x35dae058318c0869a4bd3acc659e345a60d71aa86d37b6ba299391e86d6e0b21',
  '0xba830c02b1aff9bc5a6e194bab37a3865e26bc5b33402c6f292552c7f89f9732',
  '0x6750fdc727aeb0854e57018b02e0e144820d15eed1a9e950fff367484e93aa48',
  '0x071570dd341ce1056771af8f4efd0fe3a0874eacc10228b9c4d626b007102e21',
  '0x2760966c32dd5179176ab8066895148f2bdfa3072427b9904660a0555d1c32e7'
];

const forkAccounts = forkPrivateKeys.map(privateKey => ({
  secretKey: privateKey,
  balance: forkStartingBalance,
}));

const forkUnlockedAccounts = [
  ...Object.values(addresses.whales),
  addresses.zeroExV3.ZeroExV3Governor,
  addresses.kyber.KyberNetworkProxyAdmin,
  addresses.oasis.OasisDexExchangeAdmin,
];

module.exports = {
  forkPort,
  forkStartingBalance,
  forkPrivateKeys,
  forkAccounts,
  forkUnlockedAccounts,
};
