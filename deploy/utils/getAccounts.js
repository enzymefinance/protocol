// TODO: delete this when no longer used (migration to truffle)
const getAccounts = async web3 => {
  let accounts = [];
  for (let i=0; i < web3.eth.accounts.wallet.length; i++) {
    accounts.push(web3.eth.accounts.wallet[`${i}`].address);
  }
  return accounts;
}

module.exports = getAccounts;
