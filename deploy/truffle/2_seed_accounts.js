const conf = require("../deploy-config");

module.exports = async (_, __, accounts) => {
  for (const whale of Object.values(conf.whales)) {
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: whale,
      value: web3.utils.toWei("100", "ether")
    });
  }

  await web3.eth.sendTransaction({
    from: accounts[0],
    to: conf.kyberOperator,
    value: web3.utils.toWei("100", "ether")
  });

  await web3.eth.sendTransaction({
    from: accounts[0],
    to: conf.kyberAdmin,
    value: web3.utils.toWei("100", "ether")
  });
};
