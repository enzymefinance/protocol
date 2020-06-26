const ERC20WithFields = artifacts.require("ERC20WithFields");
const MockKyberNetwork = artifacts.require("MockKyberNetwork");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy");
const mainnetAddrs = require("../../mainnet_thirdparty_contracts");
const conf = require("../deploy-config");
const BN = web3.utils.BN;

const KYBER_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

module.exports = async (deployer) => {
  const tokens = await Promise.all(conf.tokens.map(async (symbol) => {
    const address = mainnetAddrs.tokens[symbol];
    const contract = await ERC20WithFields.at(address);
    const whale = conf.whales[symbol];
    const balance = await contract.balanceOf(whale);
    const kyber = symbol === 'WETH' ? KYBER_ETH_ADDRESS : address;

    return {
      symbol,
      address,
      contract,
      whale,
      balance,
      kyber,
    };
  }))

  const kyberNetwork = await deployer.deploy(MockKyberNetwork);
  const kyberNetworkProxy = await KyberNetworkProxy.at(mainnetAddrs.kyber.KyberNetworkProxy);
  await kyberNetworkProxy.setKyberNetworkContract(kyberNetwork.address, {
    from: conf.kyberProxyAdmin,
  });

  // TODO: Make the price configurable per asset.
  const addresses = tokens.map(current => current.kyber);
  const rates = tokens.map(() => web3.utils.toWei('1', 'ether'));
  for (let token of tokens) {
    await kyberNetwork.setPairRates(token.kyber, addresses, rates);
    // transfer half of the whale's assets to the reserve.
    await token.contract.transfer(kyberNetwork.address, token.balance.div(new BN(2)), {
      from: token.whale,
    });
  }
};
