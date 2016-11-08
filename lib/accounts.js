var BigNumber = require('bignumber.js');

exports.checkNumAccounts = function(accountsReq) {
  it('Check if required num of accounts exists', () => {
    assert.isAtLeast(web3.eth.accounts, accountsReq, 'Not enough Accounts');
  });
};

exports.checkBalance = function(balanceReq, numAccounts) {
  var balances = [];
  it('Check that first n accounts have enough balance', () => {
    // Iterate over first numAccounts accounts
    for (i = 0; i < numAccounts; ++i) {
      balances[i] = new BigNumber(web3.eth.getBalance(web3.eth.accounts[i]));
      assert.isTrue(balances[i].greaterThan(balanceReq), 'One of the Accounts not funded enough');
    };
  });
  return balances;
};
