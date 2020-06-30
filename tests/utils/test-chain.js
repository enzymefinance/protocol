const ganache = require("ganache-core");
const Web3 = require("web3");
const mainnetAddrs = require("../../config");

const MAINNET_NODE_URL = process.env.MAINNET_NODE_URL;
if (!MAINNET_NODE_URL) {
  console.error('Missing MAINNET_NODE_URL environment variable');
  process.exit(1);
}

const PRIV_KEY_1 = '0xd3fdff38aaf7be159fc1c12c66982fea997df08ca5b91b399e437370d3681721';
const PRIV_KEY_2 = '0x9cc70449981c6df178133db4c075c408876e8be3b147fa11f8ee947faa0b0011';
const PRIV_KEY_3 = '0x53f76b9ee429500aacf3730228ab4fdc72683e952b48a8c4a923c04203d93a56';

const startingBalance = Web3.utils.toWei('10000000000000', 'ether');

// fork off mainnet with a specific account preloaded with 1000 ETH
const server = ganache.server({
  logger: console,
  fork: MAINNET_NODE_URL,
  network_id: 1,
  unlocked_accounts: [
    ...Object.values(mainnetAddrs.whales),
    mainnetAddrs.zeroExV3.ZeroExV3Governor,
    mainnetAddrs.kyber.KyberNetworkProxyAdmin,
    mainnetAddrs.oasis.OasisDexExchangeAdmin,
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

server.listen(8545, (error, chain) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`Forked from ${MAINNET_NODE_URL} at block ${chain.blockchain.forkBlockNumber}\n`);
  console.log(`\nTest chain started, listening...`);
});
