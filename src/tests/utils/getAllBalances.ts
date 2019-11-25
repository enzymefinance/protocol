import { BN } from 'web3-utils';

// TODO: JSDoc comments here
// instances is object containing contract instances of mln and weth
// accounts is an array of addresses
// fund is a fund address TODO: (maybe can make this part of accounts array)
// TODO: consider making this more general,
// rather than assuming certain account numbers are manager, investor, etc.
export async function getAllBalances(instances, accounts, fund) {
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
      dgx: new BN(await instances.DGX.methods.balanceOf(custodian).call()),
      ether: new BN(await web3.eth.getBalance(custodian)),
      mln: new BN(await instances.MLN.methods.balanceOf(custodian).call()),
      weth: new BN(await instances.WETH.methods.balanceOf(custodian).call()),
    },
    deployer: {
      dgx: new BN(await instances.DGX.methods.balanceOf(deployer).call()),
      ether: new BN(await web3.eth.getBalance(deployer)),
      mln: new BN(await instances.MLN.methods.balanceOf(deployer).call()),
      weth: new BN(await instances.WETH.methods.balanceOf(deployer).call()),
    },
    exchangeOwner: {
      dgx: new BN(await instances.DGX.methods.balanceOf(exchangeOwner).call()),
      ether: new BN(await web3.eth.getBalance(exchangeOwner)),
      mln: new BN(await instances.MLN.methods.balanceOf(exchangeOwner).call()),
      weth: new BN(
        await instances.WETH.methods.balanceOf(exchangeOwner).call(),
      ),
    },
    fund: {
      dgx: new BN(
        await fund.accounting.methods
          .assetHoldings(instances.DGX.options.address)
          .call(),
      ),
      ether: new BN(await web3.eth.getBalance(fund.vault.options.address)),
      mln: new BN(
        await fund.accounting.methods
          .assetHoldings(instances.MLN.options.address)
          .call(),
      ),
      weth: new BN(
        await fund.accounting.methods
          .assetHoldings(instances.WETH.options.address)
          .call(),
      ),
    },
    investor: {
      dgx: new BN(await instances.DGX.methods.balanceOf(investor).call()),
      ether: new BN(await web3.eth.getBalance(investor)),
      mln: new BN(await instances.MLN.methods.balanceOf(investor).call()),
      weth: new BN(await instances.WETH.methods.balanceOf(investor).call()),
    },
    manager: {
      dgx: new BN(await instances.DGX.methods.balanceOf(manager).call()),
      ether: new BN(await web3.eth.getBalance(manager)),
      mln: new BN(await instances.MLN.methods.balanceOf(manager).call()),
      weth: new BN(await instances.WETH.methods.balanceOf(manager).call()),
    },
    worker: {
      dgx: new BN(await instances.DGX.methods.balanceOf(worker).call()),
      ether: new BN(await web3.eth.getBalance(worker)),
      mln: new BN(await instances.MLN.methods.balanceOf(worker).call()),
      weth: new BN(await instances.WETH.methods.balanceOf(worker).call()),
    },
  };
}
