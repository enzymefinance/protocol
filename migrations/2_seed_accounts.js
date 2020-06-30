const mainnetAddrs = require("../config");

module.exports = async (_, __, [admin]) => {
  for (const whale of Object.values(mainnetAddrs.whales)) {
    await web3.eth.sendTransaction({
      from: admin,
      to: whale,
      value: web3.utils.toWei("100", "ether")
    });
  }
};
