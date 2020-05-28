const ganache = require("ganache-core");
const Web3 = require('web3');

const PORT = 8545;

const MAINNET_NODE_URL = process.env.MAINNET_NODE_URL;
const PRIV_KEY_1 = '0xd3fdff38aaf7be159fc1c12c66982fea997df08ca5b91b399e437370d3681721';
const PRIV_KEY_2 = '0x9cc70449981c6df178133db4c075c408876e8be3b147fa11f8ee947faa0b0011';
const PRIV_KEY_3 = '0x53f76b9ee429500aacf3730228ab4fdc72683e952b48a8c4a923c04203d93a56';

const startingBalance = Web3.utils.toWei('10000000000000', 'ether');

// fork off mainnet with a specific account preloaded with 1000 ETH
const server = ganache.server({
  logger: console,
  port: PORT,
  fork: MAINNET_NODE_URL,
  network_id: 1,
  unlocked_accounts: [
    '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d', // MLN whale
    '0x3eb01b3391ea15ce752d01cf3d3f09dec596f650', // KNC whale
    '0xa57bd00134b2850b2a1c55860c9e9ea100fdd6cf', // ZRX reserve operator
    '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8', // ZRX whale
    '0x7D3455421BbC5Ed534a83c88FD80387dc8271392', // ZRX Governor contract
  ],
  default_balance_ether: startingBalance,
  accounts: [ // TODO: is this array redundant?
    {
      secretKey: PRIV_KEY_1,
      balance: startingBalance,
    }, {
      secretKey: PRIV_KEY_2,
      balance: startingBalance,
    }, {
      secretKey: PRIV_KEY_3,
      balance: startingBalance,
    },
  ],
});

server.listen(PORT, (err, chain) => {
  if (err)
    throw err;
  if (MAINNET_NODE_URL === undefined)
    throw new Error('Node to fork from not specified');
  console.log(`Forked from ${MAINNET_NODE_URL} at block ${chain.blockchain.forkBlockNumber}\n`);
  console.log(`\nTest chain started on port ${PORT}, listening...`);
});
