const mainnetAddrs = require('../../mainnet_thirdparty_contracts');

module.exports = async (_, __, accounts) => {
  for (const whale of Object.values(mainnetAddrs.whales)) {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: whale,
      value: web3.utils.toWei('2', 'ether')
    });
  }
}
