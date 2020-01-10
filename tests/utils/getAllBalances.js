import { BN } from 'web3-utils';

import web3 from '~/deploy/utils/get-web3';

// TODO: JSDoc comments here
// instances is object containing contract instances of mln and weth
// accounts is an array of addresses
// fund is a fund address TODO: (maybe can make this part of accounts array)
// TODO: consider making this more general,
// rather than assuming certain account numbers are manager, investor, etc.
const getAllBalances = async (instances, accounts, fund) => {
  const [
    deployer,
    manager,
    investor,
    worker,
    exchangeOwner,
    custodian,
  ] = accounts;

  return {
    custodian: {
      ether: new BN((await web3.eth.getBalance(custodian)).toString()),
      mln: new BN((await instances.MLN.methods.balanceOf(custodian).call()).toString()),
      weth: new BN((await instances.WETH.methods.balanceOf(custodian).call()).toString()),
    },
    deployer: {
      ether: new BN(await web3.eth.getBalance(deployer)),
      mln: new BN((await instances.MLN.methods.balanceOf(deployer).call()).toString()),
      weth: new BN((await instances.WETH.methods.balanceOf(deployer).call()).toString()),
    },
    exchangeOwner: {
      ether: new BN(await web3.eth.getBalance(exchangeOwner)),
      mln: new BN((await instances.MLN.methods.balanceOf(exchangeOwner).call()).toString()),
      weth: new BN(
        (await instances.WETH.methods.balanceOf(exchangeOwner).call()).toString(),
      ),
    },
    fund: {
      ether: new BN(await web3.eth.getBalance(fund.vault.options.address)),
      mln: new BN(
        (await fund.accounting.methods
          .assetHoldings(instances.MLN.options.address)
          .call()).toString(),
      ),
      weth: new BN(
        (await fund.accounting.methods
          .assetHoldings(instances.WETH.options.address)
          .call()).toString(),
      ),
    },
    investor: {
      ether: new BN(await web3.eth.getBalance(investor)),
      mln: new BN((await instances.MLN.methods.balanceOf(investor).call()).toString()),
      weth: new BN((await instances.WETH.methods.balanceOf(investor).call()).toString()),
    },
    manager: {
      ether: new BN(await web3.eth.getBalance(manager)),
      mln: new BN((await instances.MLN.methods.balanceOf(manager).call()).toString()),
      weth: new BN((await instances.WETH.methods.balanceOf(manager).call()).toString()),
    },
    worker: {
      ether: new BN(await web3.eth.getBalance(worker)),
      mln: new BN((await instances.MLN.methods.balanceOf(worker).call()).toString()),
      weth: new BN((await instances.WETH.methods.balanceOf(worker).call()).toString()),
    },
  };
}

module.exports = getAllBalances;
