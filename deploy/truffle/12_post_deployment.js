const mainnetAddrs = require('../../mainnet_thirdparty_contracts');
const WETH = artifacts.require('WETH');

module.exports = async _ => {
  const [deployer, manager, investor] = await web3.eth.getAccounts();
  const weth = await WETH.at(mainnetAddrs.tokens.WETH);
  await weth.deposit({ value: web3.utils.toWei('10', 'ether')});
  await weth.transfer(investor, web3.utils.toWei('10', 'ether'));
}
