const web3 = require('./get-web3');

const getAccounts = async () => {
  let accounts = [];
  for (let i=0; i < web3.eth.accounts.wallet.length; i++) {
    accounts.push(web3.eth.accounts.wallet[`${i}`].address);
  }
  return accounts;
}

module.exports = getAccounts;
