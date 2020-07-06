const utils = require('web3-utils');
const ganache = require('ganache-core');
const config = require('./config');

if (!process.env.MAINNET_NODE_URL) {
  console.error('Missing MAINNET_NODE_URL environment variable');
  process.exit(1);
}

const server = ganache.server({
  logger: console,
  fork: process.env.MAINNET_NODE_URL,
  port: config.forkPort,
  network_id: 1,
  gasLimit: config.forkGasLimit,
  unlocked_accounts: config.forkUnlockedAccounts || [],
  accounts: (config.forkAccounts || []).map(item => item.secretKey),
});

server.listen(8545, (error, result) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const state = result ? result : server.provider.manager.state;

  console.log('');
  console.log('Available Accounts');
  console.log('==================');

  const accounts = state.accounts;
  const addresses = Object.keys(accounts);
  const ethInWei = new utils.BN(utils.toWei('1', 'ether'));

  addresses.forEach((address, index) => {
    const balance = new utils.BN(accounts[address].account.balance);
    const strBalance = balance.divRound(ethInWei).toString();
    const about = balance.mod(ethInWei).isZero() ? '' : '~';
    console.log(`(${index}) ${utils.toChecksumAddress(address)} (${about}${strBalance} ETH)`);
  });

  console.log('');
  console.log('Private Keys');
  console.log('==================');

  addresses.forEach((address, index) => {
    console.log(`(${index}) 0x${accounts[address].secretKey.toString('hex')}`);
  });

  console.log('');
  console.log('Forked Chain');
  console.log('==================');
  console.log(`Location:       ${state.blockchain.options.fork}`);
  console.log(`Block:          ${state.blockchain.forkBlockNumber}`);
  console.log(`Network ID:     ${state.net_version}`);
  console.log(`Time:           ${(state.blockchain.startTime || new Date()).toString()}`);

  console.log('');
  console.log(`Listening on localhost:${config.forkPort}`);
});
