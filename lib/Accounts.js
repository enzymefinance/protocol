const assert = require('assert');
const BigNumber = require('bignumber.js');


exports.checkNumAccounts = (accountsReq) => {
  it('Check if required num of accounts exists', () => {
    assert.isAtLeast(web3.eth.accounts, accountsReq, 'Not enough Accounts');
  });
};

exports.checkBalance = (balanceReq, numAccounts) => {
  const balances = [];
  it('Check that first n accounts have enough balance', () => {
    // Iterate over first numAccounts accounts
    for (let i = 0; i < numAccounts; i += 1) {
      balances[i] = new BigNumber(web3.eth.getBalance(web3.eth.accounts[i]));
      assert.isTrue(balances[i].greaterThan(balanceReq), 'One of the Accounts not funded enough');
    }
  });
  return balances;
};
