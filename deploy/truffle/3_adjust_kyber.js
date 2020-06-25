const FeeBurner = artifacts.require("FeeBurner");
const ExpectedRate = artifacts.require("ExpectedRate");
const KNC = artifacts.require("KNC");
const ERC20WithFields = artifacts.require("ERC20WithFields");
const KyberNetwork = artifacts.require("KyberNetwork");
const KyberNetworkProxy = artifacts.require("KyberNetworkProxy");
const ConversionRates = artifacts.require("ConversionRates");
const KyberReserve = artifacts.require("KyberReserve");
const conf = require("../deploy-config.js");
const mainnetAddrs = require("../../mainnet_thirdparty_contracts");
const { kyber } = require("../../mainnet_thirdparty_contracts");
const { kyberOperator, kyberAdmin } = require("../deploy-config.js");
const BN = web3.utils.BN;

module.exports = async (deployer, _, accounts) => {
  const admin = accounts[0];

  const kyberWeth = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const maxUint = new BN(2).pow(new BN(256)).sub(new BN(1));
  const tokens = await Promise.all(Object.entries(mainnetAddrs.tokens).map(async ([symbol, address]) => {
    const contract = await ERC20WithFields.at(address);
    const decimals = await contract.decimals();
    const price = new BN(10).pow(new BN(decimals));
    const whale = conf.whales[symbol];

    // token control info parameters.
    const minimalRecordResolution = new BN(10).pow(new BN(decimals - 4));
    const maxPerBlockImbalance = maxUint;
    const maxTotalImbalance = maxUint;

    return {
      symbol,
      address,
      contract,
      decimals,
      price,
      whale,
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

  // TODO: Comment this in again after we are done. This is the last step to make it fast (remove all other reserves).

  // delist existing reserves.
  // const tokenReserveMapping = await Promise.all(tokens.map(async (token) => {
  //   const rates = await kyberNetwork.getReservesRates(token.address, 0);
  //   const unique = [...rates[0], ...rates[2]].filter((reserve, index, array) => {
  //     return array.indexOf(reserve) === index;
  //   });

  //   return {
  //     token,
  //     reserves: unique,
  //   };
  // }));

  // for (const tokenReserves of tokenReserveMapping) {
  //   const address = tokenReserves.token.address;
  //   for (let reserve of tokenReserves.reserves) {
  //     await kyberNetwork.listPairForReserve(
  //       reserve,
  //       address,
  //       true,
  //       true,
  //       false
  //     , {
  //       from: conf.kyberOperator,
  //     });
  //   }
  // }

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
  await kyberReserve.enableTrade();
  await kyberReserve.addOperator(admin);
  await kyberNetwork.addReserve(kyberReserve.address, false, {
    from: kyberOperator,
  });

  for (let token of tokens) {
    const kyberTokenAddress = token.symbol === 'WETH' ? kyberWeth : token.address;
    await conversionRates.addToken(kyberTokenAddress);
    await conversionRates.setTokenControlInfo(
      kyberTokenAddress,
      token.minimalRecordResolution,
      token.maxPerBlockImbalance,
      token.maxTotalImbalance,
    );

    // allow the token to be withdrawn from the respective whale's wallet.
    await kyberReserve.setTokenWallet(kyberTokenAddress, token.whale);
    await token.contract.approve(kyberReserve.address, maxUint, {
      from: token.whale,
    });

    console.log(token.address, kyberTokenAddress);
    console.log(token.whale);
    console.log(await kyberReserve.tokenWallet(kyberTokenAddress));
    console.log((await token.contract.balanceOf(token.whale)).toString());
    console.log((await token.contract.allowance(token.whale, kyberReserve.address)).toString());
    console.log((await kyberReserve.getBalance(kyberTokenAddress)).toString());

    // enable trading for the current token on the reserve.
    await conversionRates.enableTokenTrade(kyberTokenAddress);

    // list the token for the reserve.
    await kyberNetwork.listPairForReserve(kyberReserve.address, kyberTokenAddress, true, true, true, {
      from: kyberOperator,
    });
  }

  // set prices for each token.
  const block = await web3.eth.getBlockNumber();
  await conversionRates.setBaseRate(
    tokens.map(token => token.address),
    tokens.map(token => token.price),
    tokens.map(token => token.price),
    [],
    [],
    block,
    []
  );

  console.log(
    await conversionRates.getListedTokens(),
    await kyberReserve.getBalance('0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2'),
    await kyberReserve.getBalance('0xec67005c4e498ec7f55e092bd1d35cbc47c91892'),
  )

  // console.log(
  //   await kyberNetwork.getExpectedRate(
  //     "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2",
  //     "0xec67005c4e498ec7f55e092bd1d35cbc47c91892",
  //     "1"
  //   )
  // );
};
