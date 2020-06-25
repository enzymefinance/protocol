const ERC20WithFields = artifacts.require("ERC20WithFields");
const KyberNetwork = artifacts.require("KyberNetwork");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy");
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

    // TODO: hard-code prices in config somewhere.
    const price = new BN(10).pow(new BN(decimals));
    const whale = conf.whales[symbol];

    // token control info parameters.
    const minimalRecordResolution = new BN(10).pow(new BN(decimals - 4));
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

  const kyberNetworkProxy = await KyberNetworkProxy.at(
    mainnetAddrs.kyber.KyberNetworkProxy
  );

  const kyberNetworkAddress = await kyberNetworkProxy.kyberNetworkContract();
  const kyberNetwork = await KyberNetwork.at(kyberNetworkAddress);

  // delist existing reserves.
  // TODO: This often times out. Can we optimize it a bit?
  const tokenReserveMapping = await Promise.all(tokens.map(async (token) => {
    const rates = await kyberNetwork.getReservesRates(token.address, 0);
    const unique = [...rates[0], ...rates[2]].filter((reserve, index, array) => {
      return array.indexOf(reserve) === index;
    });

    return {
      token,
      reserves: unique,
    };
  }));

  for (const tokenReserves of tokenReserveMapping) {
    const address = tokenReserves.token.address;
    for (let reserve of tokenReserves.reserves) {
      await kyberNetwork.listPairForReserve(
        reserve,
        address,
        true,
        true,
        false
      , {
        from: conf.kyberOperator,
      });
    }
  }

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
  await kyberNetwork.addReserve(kyberReserve.address, false, {
    from: conf.kyberOperator,
  });

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
    await kyberNetwork.listPairForReserve(kyberReserve.address, token.address, true, true, true, {
      from: conf.kyberOperator,
    });
  }

  // set prices for each token.
  const addresses = tokens.map(token => token.kyberAddress);
  const prices = tokens.map(token => token.price);
  const block = await web3.eth.getBlockNumber()
  await conversionRates.setBaseRate(addresses, prices, prices, [], [], block, []);
};
