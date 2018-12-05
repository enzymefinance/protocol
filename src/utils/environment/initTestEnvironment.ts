import Web3Accounts from 'web3-eth-accounts';

import { constructEnvironment } from './constructEnvironment';
import { setGlobalEnvironment } from './globalEnvironment';
import { ensure } from '../guards/ensure';
import { Address } from '@melonproject/token-math/address';

const debug = require('debug')('melon:protocol:utils:environment');

// tslint:disable-next-line:max-line-length
const testMnemonic =
  'exhibit now news planet fame thank swear reform tilt accident bitter axis';

const keyPairs = new Map([
  [
    '0xc0c82081f2ad248391cd1483ae211d56c280887a',
    '0xd3fdff38aaf7be159fc1c12c66982fea997df08ca5b91b399e437370d3681721',
  ],
  [
    '0x697d686207b035afef108f39d6ab2fe0a5528c81',
    '0x9cc70449981c6df178133db4c075c408876e8be3b147fa11f8ee947faa0b0011',
  ],
  [
    '0x957e5117873b7e64ae9bb3d7f7e907f46de480f6',
    '0x53f76b9ee429500aacf3730228ab4fdc72683e952b48a8c4a923c04203d93a56',
  ],
  [
    '0x603b6ff5667ea0610122ff483a540aa60f18d545',
    '0x1a4b1a2941ef98ab3e8aa83572bc81d8fe178a2d21ee42b888fd0597848746de',
  ],
  [
    '0x83a422230f49ce9ab2d8e75c3d493a6ccf91e36a',
    '0xb5556102fef8ffc4e044cd6708039787ed97bb5860fd1bff2fcac88d77ff70eb',
  ],
  [
    '0x1141caf50b083e21bb48130460ce11eb47758545',
    '0x35dae058318c0869a4bd3acc659e345a60d71aa86d37b6ba299391e86d6e0b21',
  ],
  [
    '0x6029bce8e8c9fe26bc096b45b1106ff4da3eba5d',
    '0xba830c02b1aff9bc5a6e194bab37a3865e26bc5b33402c6f292552c7f89f9732',
  ],
  [
    '0x94b76e27c0caf9db8a64b6b86c8dd1d89e21d709',
    '0x6750fdc727aeb0854e57018b02e0e144820d15eed1a9e950fff367484e93aa48',
  ],
  [
    '0x834cd847a5ce0bac0eda3355df9bf9fe2420e339',
    '0x071570dd341ce1056771af8f4efd0fe3a0874eacc10228b9c4d626b007102e21',
  ],
  [
    '0xbe1ac5962e318d0335b8d8aabff55dc4bad01826',
    '0x2760966c32dd5179176ab8066895148f2bdfa3072427b9904660a0555d1c32e7',
  ],
]);

const getGanache = () => {
  debug('Setting Ganache up');
  // tslint:disable-next-line:variable-name
  const Ganache = require('@melonproject/ganache-cli');
  const provider = Ganache.provider({
    gasLimit: '0x7a1200',
    // tslint:disable-next-line:object-literal-sort-keys
    default_balance_ether: 10000000000000,
    mnemonic: testMnemonic,
  });
  debug('Ganache setup finished');
  return provider;
};

export const initTestEnvironment = async () => {
  const environment = constructEnvironment({
    // Pass in Ganache.provider but only if
    // process.env.JSON_RPC_ENDPOINT is not set
    endpoint: process.env.JSON_RPC_ENDPOINT,
    provider: !process.env.JSON_RPC_ENDPOINT && getGanache(),
  });
  const accounts = await environment.eth.getAccounts();

  ensure(
    keyPairs.has(accounts[0].toLowerCase()),
    `Unknown address: ${
      accounts[0]
    }. Are you running ganache with the right mnemonic: ${testMnemonic}`,
  );

  const web3Accounts = new Web3Accounts(environment.eth.currentProvider);

  const signer = (unsignedTransaction, from = new Address(accounts[0])) =>
    web3Accounts
      .signTransaction(unsignedTransaction, keyPairs.get(from.toLowerCase()))
      .then(t => t.rawTransaction);

  const enhancedEnvironment = {
    ...environment,
    wallet: {
      address: accounts[0],
      sign: signer,
    },
  };
  setGlobalEnvironment(enhancedEnvironment);
  return enhancedEnvironment;
};
