const mainnetAddrs = require('../config');
const OasisDex = artifacts.require('IOasisDex');
const WETH = artifacts.require("WETH");
const ERC20WithFields = artifacts.require("ERC20WithFields");

module.exports = async _ => {
  const [primary, manager, investor] = await web3.eth.getAccounts();

  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  const dai = await ERC20WithFields.at(mainnetAddrs.tokens.DAI);
  const rep = await ERC20WithFields.at(mainnetAddrs.tokens.REP);
  const mln = await ERC20WithFields.at(mainnetAddrs.tokens.MLN);
  const knc = await ERC20WithFields.at(mainnetAddrs.tokens.KNC);
  const zrx = await ERC20WithFields.at(mainnetAddrs.tokens.ZRX);

  await weth.deposit({ value: web3.utils.toWei('30000', 'ether')});
  await weth.transfer(primary, web3.utils.toWei('10000', 'ether'));
  await weth.transfer(manager, web3.utils.toWei('10000', 'ether'));
  await weth.transfer(investor, web3.utils.toWei('10000', 'ether'));

  await mln.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.MLN});
  await mln.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.MLN});
  await mln.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.MLN});

  await dai.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.DAI});
  await dai.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.DAI});
  await dai.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.DAI});

  await rep.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.REP});
  await rep.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.REP});
  await rep.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.REP});

  await knc.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.KNC});
  await knc.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.KNC});
  await knc.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.KNC});

  await zrx.transfer(primary, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.ZRX});
  await zrx.transfer(manager, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.ZRX});
  await zrx.transfer(investor, web3.utils.toWei('1000', 'ether'), {from: mainnetAddrs.whales.ZRX});

  const oasisDex = await OasisDex.at(mainnetAddrs.oasis.OasisDexExchange);
  await oasisDex.setMatchingEnabled(false, {
    from: mainnetAddrs.oasis.OasisDexExchangeAdmin,
  });
}
