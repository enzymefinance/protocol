const ERC20WithFields = artifacts.require("ERC20WithFields");
const MockKyberNetwork = artifacts.require("MockKyberNetwork");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy");
const mainnetAddrs = require("../config");
const BN = web3.utils.BN;

module.exports = async (deployer) => {
  const tokens = await Promise.all(Object.entries(mainnetAddrs.tokens).map(async ([symbol, address]) => {
    const contract = await ERC20WithFields.at(address);
    const whale = mainnetAddrs.whales[symbol];
    const balance = await contract.balanceOf(whale);

    return {
      symbol,
      address,
      contract,
      whale,
      balance,
    };
  }))

  const kyberNetwork = await deployer.deploy(MockKyberNetwork);
  const kyberNetworkProxy = await KyberNetworkProxy.at(mainnetAddrs.kyber.KyberNetworkProxy);
  await kyberNetworkProxy.setKyberNetworkContract(kyberNetwork.address, {
    from: mainnetAddrs.kyber.KyberNetworkProxyAdmin,
  });

  // TODO: Make the price configurable per asset.
  const addresses = tokens.map(token => token.address);
  const rates = tokens.map(() => web3.utils.toWei('1', 'ether'));
  await kyberNetwork.setRates(addresses, rates, rates);

  for (let token of tokens) {
    // transfer half of the whale's assets to the reserve.
    await token.contract.transfer(kyberNetwork.address, token.balance.div(new BN(2)), {
      from: token.whale,
    });
  }
};
