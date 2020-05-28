const mainnetAddrs = require('../../mainnet_thirdparty_contracts');
const WETH = artifacts.require('WETH');
const MLN = artifacts.require('MLN');
const KNC = artifacts.require('KNC');
const ZRX = artifacts.require('ZRX');

module.exports = async _ => {
  const [primary, manager, investor] = await web3.eth.getAccounts();

  // TODO: change how we send these tokens in
  // case balance changes (e.g. buy from uniswap or mint)
  const mlnWhale = '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d';
  const kncWhale = '0x3eb01b3391ea15ce752d01cf3d3f09dec596f650';
  const zrxWhale = '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8';

  // load whales with eth
  await web3.eth.sendTransaction({
    from: primary,
    to: zrxWhale,
    value: web3.utils.toWei('100', 'ether')
  });


  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  const mln = await MLN.at(mainnetAddrs.tokens.MLN);
  const knc = await KNC.at(mainnetAddrs.tokens.KNC);
  const zrx = await ZRX.at(mainnetAddrs.tokens.ZRX);

  await weth.deposit({ value: web3.utils.toWei('30000', 'ether')});
  await weth.transfer(primary, web3.utils.toWei('10000', 'ether'));
  await weth.transfer(manager, web3.utils.toWei('10000', 'ether'));
  await weth.transfer(investor, web3.utils.toWei('10000', 'ether'));

  await mln.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: mlnWhale});
  await mln.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: mlnWhale});
  await mln.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: mlnWhale});

  await knc.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: kncWhale});
  await knc.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: kncWhale});
  await knc.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: kncWhale});

  await zrx.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: zrxWhale});
  await zrx.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: zrxWhale});
  await zrx.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: zrxWhale});
}
