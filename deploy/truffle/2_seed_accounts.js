const mainnetAddrs = require("../../mainnet_thirdparty_contracts");

module.exports = async (_, __, [admin]) => {
  for (const whale of Object.values(mainnetAddrs.whales)) {
    await web3.eth.sendTransaction({
      from: admin,
      to: whale,
      value: web3.utils.toWei("100", "ether")
    });
  }
};
