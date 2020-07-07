const ganache = require('ganache-core');
const ethers = require('ethers');
const config = require('./config');

if (!process.env.MAINNET_NODE_URL) {
  console.error('Missing MAINNET_NODE_URL environment variable');
  process.exit(1);
}

const server = ganache.server({
  logger: console,
  fork: process.env.MAINNET_NODE_URL,
  unlocked_accounts: config.forkUnlockedAccounts,
  accounts: config.forkAccounts,
});

server.listen(config.forkPort, () => {
  const state = server.provider.manager.state;

  console.log('');
  console.log('Available Accounts');
  console.log('==================');

  const accounts = state.accounts;
  const addresses = Object.keys(accounts);
  const ethInWei = ethers.BigNumber.from(ethers.utils.parseEther('1'));

  addresses.forEach((address, index) => {
    const balance = ethers.BigNumber.from(accounts[address].account.balance);
    const strBalance = balance.div(ethInWei).toString();
    const about = balance.mod(ethInWei).isZero() ? '' : '~';
    console.log(`(${index}) ${ethers.utils.getAddress(address)} (${about}${strBalance} ETH)`);
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
