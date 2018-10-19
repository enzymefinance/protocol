import * as fs from 'fs';
import * as path from 'path';
import * as Eth from 'web3-eth';

import { Address } from '@melonproject/token-math/address';

// Websocket could be the problem
// HTTP is faster, but same error
const eth = new Eth(new Eth.providers.HttpProvider('http://localhost:8545'));

const rawABI = fs.readFileSync(
  path.join(process.cwd(), 'out', 'factory', 'FundFactory.abi'),
  { encoding: 'utf-8' },
);
const ABI = JSON.parse(rawABI);
const fundFactoryAddress = '0x801cd3BCa02ffB46Ee5cf43B023Aa3619089d16b';
const contract = new eth.Contract(ABI, fundFactoryAddress);

const args = [
  ['0x9a8D6f20b917eA9542EEE886c78fE41C638A3d45'],
  ['0x4b1a08B5DBcf3386f22DB1d694beF84d8EF4B340'],
  [
    '0xc0dd7a9D5470216eaf97DD2CEcAc259da1f7Af2E',
    '0x2B83156799AB55F5581263Cd544372B9af2c2Cfe',
  ],
  [false],
  '0x0BD6f791464E1c6BaD8C8bb7a78999BE831C2691',
];

const exec = async () => {
  const accounts = await eth.getAccounts();
  console.log(accounts);

  try {
    const receipt = await contract.methods
      // ... is good!
      .createComponents(...args)
      .send({ from: accounts[0] });

    console.log(receipt);
  } catch (e) {
    console.error(e);
  }
};

exec(); // .finally(process.exit);
