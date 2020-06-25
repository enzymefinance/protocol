const conf = require('../deploy-config.js');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

const Registry = artifacts.require('Registry');
const WETH = artifacts.require('WETH');
const MLN = artifacts.require('MLN');
const KNC = artifacts.require('KNC');
const ZRX = artifacts.require('ZRX');

module.exports = async _ => {
  const [primary, manager, investor] = await web3.eth.getAccounts();

  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  const mln = await MLN.at(mainnetAddrs.tokens.MLN);
  const knc = await KNC.at(mainnetAddrs.tokens.KNC);
  const zrx = await ZRX.at(mainnetAddrs.tokens.ZRX);

  await weth.deposit({ value: web3.utils.toWei('30000', 'ether')});
  await weth.transfer(primary, web3.utils.toWei('10000', 'ether'));
  await weth.transfer(manager, web3.utils.toWei('10000', 'ether'));
  await weth.transfer(investor, web3.utils.toWei('10000', 'ether'));

  await mln.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: conf.whales.MLN});
  await mln.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: conf.whales.MLN});
  await mln.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: conf.whales.MLN});

  await knc.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: conf.whales.KNC});
  await knc.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: conf.whales.KNC});
  await knc.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: conf.whales.KNC});

  await zrx.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: conf.whales.ZRX});
  await zrx.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: conf.whales.ZRX});
  await zrx.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: conf.whales.ZRX});

  // finally set Registry owner
  await (await Registry.deployed()).setOwner(conf.melonRegistryOwner);
}
