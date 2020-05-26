const mainnetAddrs = require('../../mainnet_thirdparty_contracts');
const WETH = artifacts.require('WETH');
const MLN = artifacts.require('MLN');

module.exports = async _ => {
  const [deployer, manager, investor] = await web3.eth.getAccounts();
  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  const mln = await MLN.at(mainnetAddrs.tokens.MLN);

  await weth.deposit({ value: web3.utils.toWei('30000', 'ether')});
  await weth.transfer(deployer, web3.utils.toWei('10000', 'ether'));
  await weth.transfer(manager, web3.utils.toWei('10000', 'ether'));
  await weth.transfer(investor, web3.utils.toWei('10000', 'ether'));

  // TODO: change in case balance changes (e.g. buy from uniswap or mint)
  const mlnWhale = '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d';
  await mln.transfer(deployer, web3.utils.toWei('1000', 'ether'), {from: mlnWhale});
  await mln.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: mlnWhale});
  await mln.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: mlnWhale});
}
