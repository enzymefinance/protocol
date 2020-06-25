const ERC20WithFields = artifacts.require("ERC20WithFields");
const KyberNetwork = artifacts.require("KyberNetwork");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy");
const FeeBurner = artifacts.require("FeeBurner");
const ExpectedRate = artifacts.require("ExpectedRate");
const ConversionRates = artifacts.require("ConversionRates");
const KyberReserve = artifacts.require("KyberReserve");
const conf = require("../deploy-config.js");
const mainnetAddrs = require("../../mainnet_thirdparty_contracts");
const BN = web3.utils.BN;

module.exports = async (deployer, _, accounts) => {
  const admin = accounts[0];

  const kyberWeth = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const maxUint = new BN(2).pow(new BN(256)).sub(new BN(1));
  const tokens = await Promise.all(Object.entries(mainnetAddrs.tokens).map(async ([symbol, address]) => {
    const contract = await ERC20WithFields.at(address);
    const decimals = await contract.decimals();

    // TODO: hard-code prices in config somewhere to make them a bit more variant.
    const price = new BN(10).pow(new BN(decimals));
    const whale = conf.whales[symbol];

    // token control info parameters.
    const minimalRecordResolution = new BN(10).pow(new BN(decimals).sub(new BN(4)));
    const maxPerBlockImbalance = maxUint;
    const maxTotalImbalance = maxUint;
    const kyberAddress = symbol === 'WETH' ? kyberWeth : address;

    return {
      symbol,
      address,
      contract,
      decimals,
      price,
      whale,
      kyberAddress,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance,
    }
  }));

  const kyberNetwork = await deployer.deploy(KyberNetwork, admin);
  await kyberNetwork.addOperator(admin);

  const kyberNetworkProxy = await deployer.deploy(KyberNetworkProxy, admin);
  await kyberNetworkProxy.setKyberNetworkContract(kyberNetwork.address);

  const kncToken = mainnetAddrs.tokens.KNC;
  const feeBurner = await deployer.deploy(FeeBurner, admin, kncToken, kyberNetwork.address, new BN(10).pow(new BN(18)));
  await feeBurner.setOperator(admin);
  await kyberNetwork.setFeeBurner(feeBurner.address);

  const expectedRate = await deployer.deploy(ExpectedRate, kyberNetwork.address, admin);
  await kyberNetwork.setExpectedRate(expectedRate.address);

  // create our custom reserve.
  const conversionRates = await deployer.deploy(ConversionRates, admin);
  const kyberReserve = await deployer.deploy(
    KyberReserve,
    kyberNetwork.address,
    conversionRates.address,
    admin
  );

  await conversionRates.addOperator(admin);
  await conversionRates.setValidRateDurationInBlocks(maxUint);
  await conversionRates.setReserveAddress(kyberReserve.address);

  // enable our custom reserve.
  await kyberReserve.addOperator(admin);
  await kyberNetwork.addReserve(kyberReserve.address, false);

  // set no fees.
  await feeBurner.setReserveData(kyberReserve.address, 0, kyberReserve.address);

  for (let token of tokens) {
    await conversionRates.addToken(token.kyberAddress);
    await conversionRates.setQtyStepFunction(token.kyberAddress, [0], [0], [0], [0]);
    await conversionRates.setImbalanceStepFunction(token.kyberAddress, [0], [0], [0], [0]);
    await conversionRates.setTokenControlInfo(
      token.kyberAddress,
      token.minimalRecordResolution,
      token.maxPerBlockImbalance,
      token.maxTotalImbalance,
    );

    // this also sets the reserve itself as the token wallet.
    await kyberReserve.approveWithdrawAddress(token.kyberAddress, admin, true);
    // transfer half of the whale's assets to the reserve.
    const balance = await token.contract.balanceOf(token.whale);
    await token.contract.transfer(kyberReserve.address, balance.div(new BN(2)), {
      from: token.whale,
    });

    // enable trading for the current token on the reserve.
    await conversionRates.enableTokenTrade(token.kyberAddress);
    // list the token for the reserve.
    await kyberNetwork.listPairForReserve(kyberReserve.address, token.address, true, true, true);
  }

  // set prices for each token.
  const addresses = tokens.map(token => token.kyberAddress);
  const prices = tokens.map(token => token.price);
  const block = await web3.eth.getBlockNumber()
  await conversionRates.setBaseRate(addresses, prices, prices, [], [], block, []);
};
