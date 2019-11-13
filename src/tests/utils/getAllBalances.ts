import { BN } from 'web3-utils';

// TODO: JSDoc comments here
// instances is object containing contract instances of mln and weth
// accounts is an array of addresses
// fund is a fund address TODO: (maybe can make this part of accounts array)
// TODO: consider making this more general,
// rather than assuming certain account numbers are manager, investor, etc.
export async function getAllBalances(instances, accounts, fund, env) {
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
      dgx: new BN(await instances.dgx.methods.balanceOf(custodian).call()),
      ether: new BN(await env.eth.getBalance(custodian)),
      mln: new BN(await instances.mln.methods.balanceOf(custodian).call()),
      weth: new BN(await instances.weth.methods.balanceOf(custodian).call()),
    },
    deployer: {
      dgx: new BN(await instances.dgx.methods.balanceOf(deployer).call()),
      ether: new BN(await env.eth.getBalance(deployer)),
      mln: new BN(await instances.mln.methods.balanceOf(deployer).call()),
      weth: new BN(await instances.weth.methods.balanceOf(deployer).call()),
    },
    exchangeOwner: {
      dgx: new BN(await instances.dgx.methods.balanceOf(exchangeOwner).call()),
      ether: new BN(await env.eth.getBalance(exchangeOwner)),
      mln: new BN(await instances.mln.methods.balanceOf(exchangeOwner).call()),
      weth: new BN(
        await instances.weth.methods.balanceOf(exchangeOwner).call(),
      ),
    },
    fund: {
      dgx: new BN(
        await fund.accounting.methods
          .assetHoldings(instances.dgx.options.address)
          .call(),
      ),
      ether: new BN(await env.eth.getBalance(fund.vault.options.address)),
      mln: new BN(
        await fund.accounting.methods
          .assetHoldings(instances.mln.options.address)
          .call(),
      ),
      weth: new BN(
        await fund.accounting.methods
          .assetHoldings(instances.weth.options.address)
          .call(),
      ),
    },
    investor: {
      dgx: new BN(await instances.dgx.methods.balanceOf(investor).call()),
      ether: new BN(await env.eth.getBalance(investor)),
      mln: new BN(await instances.mln.methods.balanceOf(investor).call()),
      weth: new BN(await instances.weth.methods.balanceOf(investor).call()),
    },
    manager: {
      dgx: new BN(await instances.dgx.methods.balanceOf(manager).call()),
      ether: new BN(await env.eth.getBalance(manager)),
      mln: new BN(await instances.mln.methods.balanceOf(manager).call()),
      weth: new BN(await instances.weth.methods.balanceOf(manager).call()),
    },
    worker: {
      dgx: new BN(await instances.dgx.methods.balanceOf(worker).call()),
      ether: new BN(await env.eth.getBalance(worker)),
      mln: new BN(await instances.mln.methods.balanceOf(worker).call()),
      weth: new BN(await instances.weth.methods.balanceOf(worker).call()),
    },
  };
}
