import api from "./api";

const BigNumber = require('bignumber.js');

// TODO: JSDoc comments here
// instances is object containing contract instances of (at least) MlnToken and EthToken
// accounts is an array of addresses
// fund is a fund address TODO: (maybe can make this part of accounts array)
async function getAllBalances(instances, accounts, fund) {

  const [deployer, manager, investor, worker] = accounts;

  return {
    investor: {
      MlnToken: Number(
        await instances.MlnToken.instance.balanceOf.call({}, [investor]),
      ),
      EthToken: Number(
        await instances.EthToken.instance.balanceOf.call({}, [investor]),
      ),
      ether: new BigNumber(await api.eth.getBalance(investor)),
    },
    manager: {
      MlnToken: Number(await instances.MlnToken.instance.balanceOf.call({}, [manager])),
      EthToken: Number(await instances.EthToken.instance.balanceOf.call({}, [manager])),
      ether: new BigNumber(await api.eth.getBalance(manager)),
    },
    fund: {
      MlnToken: Number(
        await instances.MlnToken.instance.balanceOf.call({}, [fund.address]),
      ),
      EthToken: Number(
        await instances.EthToken.instance.balanceOf.call({}, [fund.address]),
      ),
      ether: new BigNumber(await api.eth.getBalance(fund.address)),
    },
    worker: {
      MlnToken: Number(await instances.MlnToken.instance.balanceOf.call({}, [worker])),
      EthToken: Number(await instances.EthToken.instance.balanceOf.call({}, [worker])),
      ether: new BigNumber(await api.eth.getBalance(worker)),
    },
    deployer: {
      MlnToken: Number(
        await instances.MlnToken.instance.balanceOf.call({}, [deployer]),
      ),
      EthToken: Number(
        await instances.EthToken.instance.balanceOf.call({}, [deployer]),
      ),
      ether: new BigNumber(await api.eth.getBalance(deployer)),
    },
  };
}

export default getAllBalances;
