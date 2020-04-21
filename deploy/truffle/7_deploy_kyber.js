const conf = require('../deploy-config.js');
const BN = web3.utils.BN;

const MLN = artifacts.require('MLN');
const EUR = artifacts.require('EUR');
const KNC = artifacts.require('KNC');
const ConversionRates = artifacts.require('ConversionRates');
const KyberNetwork = artifacts.require('KyberNetwork');
const KyberNetworkProxy = artifacts.require('KyberNetworkProxy');
const KyberReserve = artifacts.require('KyberReserve');
const KyberWhiteList = artifacts.require('KyberWhiteList');
const FeeBurner = artifacts.require('FeeBurner');
const ExpectedRate = artifacts.require('ExpectedRate');

module.exports = async (deployer, _, accounts) => {

  const primary = accounts[0];
  const conversionRateAdmin = primary;
  const kyberNetworkAdmin = primary;

  const blockNumber = (await web3.eth.getBlock('latest')).number;

  const mln = await MLN.deployed();
  const eur = await EUR.deployed();
  const knc = await KNC.deployed();

  const conversionRates = await deployer.deploy(ConversionRates, conversionRateAdmin);
  const kyberNetwork = await deployer.deploy(KyberNetwork, kyberNetworkAdmin);
  const kyberReserve = await deployer.deploy(
    KyberReserve,
    kyberNetwork.address,
    conversionRates.address,
    primary
  );
  const kyberWhiteList = await deployer.deploy(
    KyberWhiteList,
    primary,
    knc.address // note: should be KGT but it doesn't matter in this context
  );
  const feeBurner = await deployer.deploy(
    FeeBurner,
    primary,
    knc.address,
    kyberNetwork.address,
    18
  );
  const expectedRate = await deployer.deploy(
    ExpectedRate,
    kyberNetwork.address,
    primary
  );

  const kyberNetworkProxy = await deployer.deploy(KyberNetworkProxy, primary);

  await kyberNetworkProxy.setKyberNetworkContract(kyberNetwork.address);
  await kyberNetwork.setWhiteList(kyberWhiteList.address);
  await kyberNetwork.setExpectedRate(expectedRate.address);
  await kyberNetwork.setFeeBurner(feeBurner.address);
  await kyberNetwork.setKyberProxy(kyberNetworkProxy.address);
  await kyberNetwork.setEnable(true);

  await conversionRates.setValidRateDurationInBlocks(conf.kyberRateDuration);
  await conversionRates.addToken(mln.address);
  await conversionRates.setTokenControlInfo(
    mln.address,
    conf.kyberMinimalRecordResolution,
    conf.kyberMaxPerBlockImbalance.toString(),
    conf.kyberMaxTotalImbalance.toString()
  );
  await conversionRates.enableTokenTrade(mln.address);
  await conversionRates.setReserveAddress(kyberReserve.address);

  await kyberNetwork.addOperator(primary);
  await kyberNetwork.addReserve(kyberReserve.address, true);

  await kyberReserve.approveWithdrawAddress(mln.address, primary, true);
  await kyberReserve.enableTrade();

  await mln.transfer(kyberReserve.address, conf.kyberTokensToTransfer.toString());

  await conversionRates.addOperator(primary);
  await conversionRates.setBaseRate(
    [mln.address],
    [conf.kyberTokensPerEther.toString()],
    [conf.kyberEthersPerToken.toString()],
    ['0x0000000000000000000000000000'],
    ['0x0000000000000000000000000000'],
    blockNumber,
    [0]
  );
  await conversionRates.setQtyStepFunction(mln.address, [0], [0], [0], [0]);
  await conversionRates.setImbalanceStepFunction(mln.address, [0], [0], [0], [0]);

  await kyberWhiteList.addOperator(primary);
  await kyberWhiteList.setCategoryCap(0, conf.kyberCategoryCap.toString());
  await kyberWhiteList.setSgdToEthRate(30000);

  // TODO: send ETH to kyberReserve
  await kyberReserve.sendTransaction({ value: conf.kyberInitialReserveAmount });

  await kyberReserve.setContracts(
    kyberNetwork.address,
    conversionRates.address,
    '0x0000000000000000000000000000000000000000'
  );
  await kyberNetwork.listPairForReserve(
    kyberReserve.address,
    mln.address,
    true,
    true,
    true
  );

  conversionRates.addToken(eur.address);
  await conversionRates.setTokenControlInfo(
    eur.address,
    conf.kyberMinimalRecordResolution,
    conf.kyberMaxPerBlockImbalance.toString(),
    conf.kyberMaxTotalImbalance.toString()
  );
  await conversionRates.enableTokenTrade(eur.address);
  await kyberReserve.approveWithdrawAddress(eur.address, primary, true);

  await eur.transfer(kyberReserve.address, conf.kyberTokensToTransfer.toString());

  await conversionRates.setBaseRate(
    [eur.address],
    [conf.kyberTokensPerEther.toString()],
    [conf.kyberEthersPerToken.toString()],
    ['0x0000000000000000000000000000'],
    ['0x0000000000000000000000000000'],
    blockNumber,
    [0]
  );
  await conversionRates.setQtyStepFunction(eur.address, [0], [0], [0], [0]);
  await conversionRates.setImbalanceStepFunction(eur.address, [0], [0], [0], [0]);
  await kyberNetwork.listPairForReserve(
    kyberReserve.address,
    eur.address,
    true,
    true,
    true
  );
}
