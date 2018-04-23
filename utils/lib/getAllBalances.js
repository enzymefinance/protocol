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
      MlnToken: new BigNumber(await instances.MlnToken.instance.balanceOf.call({}, [investor])),
      EthToken: new BigNumber(await instances.EthToken.instance.balanceOf.call({}, [investor])),
      ether: new BigNumber(await api.eth.getBalance(investor))
    },
    manager: {
      MlnToken: new BigNumber(await instances.MlnToken.instance.balanceOf.call({}, [manager])),
      EthToken: new BigNumber(await instances.EthToken.instance.balanceOf.call({}, [manager])),
      ether: new BigNumber(await api.eth.getBalance(manager))
    },
    fund: {
      MlnToken: new BigNumber(await instances.MlnToken.instance.balanceOf.call({}, [fund.address])),
      EthToken: new BigNumber(await instances.EthToken.instance.balanceOf.call({}, [fund.address])),
      ether: new BigNumber(await api.eth.getBalance(fund.address))
    },
    worker: {
      MlnToken: new BigNumber(await instances.MlnToken.instance.balanceOf.call({}, [worker])),
      EthToken: new BigNumber(await instances.EthToken.instance.balanceOf.call({}, [worker])),
      ether: new BigNumber(await api.eth.getBalance(worker))
    },
    deployer: {
      MlnToken: new BigNumber(await instances.MlnToken.instance.balanceOf.call({}, [deployer])),
      EthToken: new BigNumber(await instances.EthToken.instance.balanceOf.call({}, [deployer])),
      ether: new BigNumber(await api.eth.getBalance(deployer)),
    },
    exchangeOwner: {
      MlnToken: new BigNumber(await instances.MlnToken.instance.balanceOf.call({}, [exchangeOwner])),
      EthToken: new BigNumber(await instances.EthToken.instance.balanceOf.call({}, [exchangeOwner])),
      ether: new BigNumber(await api.eth.getBalance(deployer)),
    },
    custodian: {
      MlnToken: new BigNumber(await instances.MlnToken.instance.balanceOf.call({}, [custodian])),
      EthToken: new BigNumber(await instances.EthToken.instance.balanceOf.call({}, [custodian])),
      ether: new BigNumber(await api.eth.getBalance(custodian)),
    }
  };
}

export default getAllBalances;
