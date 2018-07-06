import api from "./api";

const BigNumber = require('bignumber.js');

// TODO: JSDoc comments here
// instances is object containing contract instances of (at least) MlnToken and EthToken
// accounts is an array of addresses
// fund is a fund address TODO: (maybe can make this part of accounts array)
// TODO: consider making this more general, rather than assuming certain account numbers are manager, investor, etc.
async function getAllBalances(instances, accounts, fund) {

  const [deployer, manager, investor, worker, exchangeOwner, custodian] = accounts;

  return {
    investor: {
      MlnToken: new BigNumber(await instances.MlnToken.methods.balanceOf(investor).call()),
      EthToken: new BigNumber(await instances.EthToken.methods.balanceOf(investor).call()),
      ether: new BigNumber(await api.eth.getBalance(investor))
    },
    manager: {
      MlnToken: new BigNumber(await instances.MlnToken.methods.balanceOf(manager).call()),
      EthToken: new BigNumber(await instances.EthToken.methods.balanceOf(manager).call()),
      ether: new BigNumber(await api.eth.getBalance(manager))
    },
    fund: {
      MlnToken: new BigNumber(await instances.MlnToken.methods.balanceOf(fund.options.address).call()),
      EthToken: new BigNumber(await instances.EthToken.methods.balanceOf(fund.options.address).call()),
      ether: new BigNumber(await api.eth.getBalance(fund.options.address))
    },
    worker: {
      MlnToken: new BigNumber(await instances.MlnToken.methods.balanceOf(worker).call()),
      EthToken: new BigNumber(await instances.EthToken.methods.balanceOf(worker).call()),
      ether: new BigNumber(await api.eth.getBalance(worker))
    },
    deployer: {
      MlnToken: new BigNumber(await instances.MlnToken.methods.balanceOf(deployer).call()),
      EthToken: new BigNumber(await instances.EthToken.methods.balanceOf(deployer).call()),
      ether: new BigNumber(await api.eth.getBalance(deployer)),
    },
    exchangeOwner: {
      MlnToken: new BigNumber(await instances.MlnToken.methods.balanceOf(exchangeOwner).call()),
      EthToken: new BigNumber(await instances.EthToken.methods.balanceOf(exchangeOwner).call()),
      ether: new BigNumber(await api.eth.getBalance(deployer)),
    },
    custodian: {
      MlnToken: new BigNumber(await instances.MlnToken.methods.balanceOf(custodian).call()),
      EthToken: new BigNumber(await instances.EthToken.methods.balanceOf(custodian).call()),
      ether: new BigNumber(await api.eth.getBalance(custodian)),
    }
  };
}

export default getAllBalances;
