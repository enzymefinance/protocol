const FeeBurner = artifacts.require('FeeBurner');
const ExpectedRate = artifacts.require('ExpectedRate');
const KNC = artifacts.require('KNC');
const ERC20WithFields = artifacts.require('ERC20WithFields');
const KyberNetwork = artifacts.require('KyberNetwork');
const KyberNetworkProxy = artifacts.require('KyberNetworkProxy');
const ConversionRates = artifacts.require('ConversionRates');
const KyberReserve = artifacts.require('KyberReserve');
const conf = require('../deploy-config.js');
const mainnetAddrs = require('../../mainnet_thirdparty_contracts');
const BN = web3.utils.BN;

module.exports = async (deployer, _, accounts) => {
  const admin = accounts[0];
  const kyberNetwork = await KyberNetwork.at(mainnetAddrs.kyber.KyberNetwork);
  console.log(await kyberNetwork.getExpectedRate('0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', '0xec67005c4e498ec7f55e092bd1d35cbc47c91892', '1000000000000000000'))
  const originalKyberAdmin = conf.originalKyberAdmin;
  if ((await kyberNetwork.admin()) === originalKyberAdmin) {
    await kyberNetwork.transferAdminQuickly(admin, {from: originalKyberAdmin});
    await kyberNetwork.addOperator(admin);
  }
  // get rid of existing reserves
  for (let i=0; i < await kyberNetwork.getNumReserves(); i++) {
    const reserve = await KyberReserve.at(
      await kyberNetwork.reserves(0)
    );
    for (let token of Object.values(mainnetAddrs.tokens)) {
      await kyberNetwork.listPairForReserve(
        reserve.address,
        token,
        true,
        true,
        false
      );
    }
    await kyberNetwork.removeReserve(
      reserve.address,
      0
    );
  }

  const kyberNetworkProxy = await deployer.deploy(KyberNetworkProxy, admin);
  await kyberNetworkProxy.setKyberNetworkContract(kyberNetwork.address);
  await kyberNetwork.setKyberProxy(kyberNetworkProxy.address);

  const feeBurner = await deployer.deploy(FeeBurner, admin, mainnetAddrs.tokens.KNC, kyberNetwork.address, 18);
  const expectedRate = await deployer.deploy(ExpectedRate, kyberNetwork.address, mainnetAddrs.tokens.KNC, admin);
  await kyberNetwork.setFeeBurner(feeBurner.address);
  await kyberNetwork.setExpectedRate(expectedRate.address);

  console.log(await kyberNetwork.getExpectedRate('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '0xec67005c4e498ec7f55e092bd1d35cbc47c91892', 1))
  // add reserve
  const maxUint = (new BN(2)).pow(new BN(256)).sub(new BN(1));
  const conversionRates = await deployer.deploy(ConversionRates, admin);
  await conversionRates.addOperator(admin);
  await conversionRates.setValidRateDurationInBlocks(maxUint);

  const kyberReserve = await deployer.deploy(KyberReserve, kyberNetwork.address, conversionRates.address, admin);
  await kyberNetwork.addReserve(kyberReserve.address, false);
  await kyberReserve.addOperator(admin);
  await kyberReserve.enableTrade();
  await conversionRates.setReserveAddress(kyberReserve.address);

  const tokenPrices = [];
  const tokens = Object.entries(mainnetAddrs.tokens);
  for (let [symbol, tokenAddress] of tokens) {
    const whale = mainnetAddrs.whales[symbol];
    // set withdraw address for each token
    const token = await ERC20WithFields.at(tokenAddress);
    const decimals = await token.decimals();
    tokenPrices.push((new BN(10)).pow(new BN(decimals)));
    await conversionRates.addToken(tokenAddress);
    await conversionRates.setTokenControlInfo(
      tokenAddress,
      (new BN(10)).pow(new BN(decimals-4)),
      maxUint,
      maxUint
    );
    await conversionRates.enableTokenTrade(tokenAddress);
    await kyberReserve.setTokenWallet(tokenAddress, whale);
    await token.approve(kyberReserve.address, maxUint, {from: whale});
    await kyberNetwork.listPairForReserve(
      kyberReserve.address,
      tokenAddress,
      true,
      true,
      true
    );
  }

  // set prices for each token
  await conversionRates.setBaseRate(
    tokens.map(([,token]) => token),
    tokenPrices,
    tokenPrices,
    [],
    [],
    (await web3.eth.getBlockNumber()),
    [],
  );

  console.log(await kyberNetwork.getExpectedRate('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', '0xec67005c4e498ec7f55e092bd1d35cbc47c91892', 1))
}
