// TODO: delete this when no longer used (migration to truffle)
const fs = require('fs');
const Web3 = require('web3');

const web3 = new Web3('http://localhost:8545', null, {
  transactionConfirmationBlocks: 1,
});

// // get private keys stored in a file, like that produced by ganache --acctKeys
// if (process.env.PRIVATE_KEYS) { // TODO: move away from env var
//   const keys = JSON.parse(fs.readFileSync(process.env.PRIVATE_KEYS));
//   for (let [addr, pkey] of Object.entries(keys.private_keys)) {
//     if (!pkey.startsWith('0x')) {
//       pkey = '0x' + pkey;
//     }

//     web3.eth.accounts.wallet.add({
//       address: addr,
//       privateKey: pkey
//     });
//   }
// }

module.exports = web3;
