const conf = require('../deploy-config.js');
const BN = web3.utils.BN;

const MLN = artifacts.require('MLN');
const EUR = artifacts.require('EUR');
const KNC = artifacts.require('KNC');
const KGT = artifacts.require('KGT');
const ConversionRates = artifacts.require('ConversionRates');
const KyberNetwork = artifacts.require('KyberNetwork');
const KyberNetworkProxy = artifacts.require('KyberNetworkProxy');
const KyberReserve = artifacts.require('KyberReserve');
const KyberWhiteList = artifacts.require('KyberWhiteList');
const FeeBurner = artifacts.require('FeeBurner');
const ExpectedRate = artifacts.require('ExpectedRate');

module.exports = async (deployer, _, accounts) => {

  const primary = accounts[0];
  // TODO: config addrs

  const mln = MLN.deployed();
  const eur = EUR.deployed();
  const knc = KNC.deployed();
  const kgt = await deployer.deploy(KGT); // TODO: is this required?

  const conversionRates = await deployer.deploy(ConversionRates, conversionRateAdmin);
  const kyberNetwork = await deployer.deploy(KyberNetwork, kyberNetworkAdmin);
  const kyberReserve = await deployer.deploy(
    KyberReserve,
    kyberNetwork.options.address,
    conversionRates.options.address,
    primary
  );
  const kyberWhiteList = await deployer.deploy(
    KyberWhiteList,
    primary,
    kgt.options.address
  );
  const feeBurner = await deployer.deploy(
    FeeBurner,
    primary,
    knc.options.address,
    kyberNetwork.options.address,
    18
  );
  const expectedRate = await deployer.deploy(
    ExpectedRate,
    kyberNetwork.options.address,
    knc.options.address,
    conf.deployer
  );

  const kyberNetworkProxy = await deployer.deploy(KyberNetworkProxy, primary);

  await kyberNetworkProxy.setKyberNetworkContract(kyberNetwork.options.address);
  await kyberNetwork.setWhiteList(kyberWhiteList.options.address);
  await kyberNetwork.setExpectedRate(expectedRate.options.address);
  await kyberNetwork.setFeeBurner(feeBurner.options.address);
  await kyberNetwork.setKyberProxy(kyberNetworkProxy.options.address);
  await kyberNetwork.setEnable(true);

  await conversionRates.setValidRateDurationInBlocks(rateDuration);
  await conversionRates.addToken(mln.options.address);
  await conversionRates.setTokenControlInfo(
    mln.options.address,
    minimalRecordResolution,
    maxPerBlockImbalance.toString(),
    maxTotalImbalance.toString()
  );
  await conversionRates.enableTokenTrade(mln.options.address);
  await conversionRates.setReserveAddress(kyberReserve.options.address);

  await kyberNetwork.addOperator(primary);
  await kyberNetwork.addReserve(kyberReserve.options.address, true);

  await kyberReserve.approveWithdrawAddress(mln.options.address, primary, true);
  await kyberReserve.enableTrade();

  await mln.transfer(kyberReserve.options.address, tokensToTransfer.toString());

  await conversionRates.addOperator(primary);
  await conversionRates.setBaseRate(
    [mln.options.address],
    [tokensPerEther.toString()],
    [ethersPerToken.toString()],
    ['0x0000000000000000000000000000'],
    ['0x0000000000000000000000000000'],
    blockNumber,
    [0]
  );
  await conversionRates.setQtyStepFunction(mln.options.address, [0], [0], [0], [0]);
  await conversionRates.setImbalanceStepFunction(mln.options.address, [0], [0], [0], [0]);

  await kyberWhiteList.addOperator(primary);
  await kyberWhiteList.setCategoryCap(0, categoryCap.toString());
  await kyberWhiteList.setSgdToEthRate(30000);

  // TODO: send ETH to kyberReserve
  // await send(kyberReserve, undefined, [], { value: ethToSend.toString() });

  await kyberReserve.setContracts(
    kyberNetwork.options.address,
    conversionRates.options.address,
    '0x0000000000000000000000000000000000000000'
  );
  await kyberNetwork.listPairForReserve(
    kyberReserve.options.address,
    mln.options.address,
    true,
    true,
    true
  );

  conversionRates.addToken(eur.options.address);
  await conversionRates.setTokenControlInfo(
    eur.options.address,
    minimalRecordResolution,
    maxPerBlockImbalance.toString(),
    maxTotalImbalance.toString()
  );
  await conversionRates.enableTokenTrade(eur.options.address);
  await kyberReserve.approveWithdrawAddress(eur.options.address, primary, true);

  await eur.transfer(kyberReserve.options.address, tokensToTransfer.toString());

  await conversionRates.setBaseRate(
    [eur.options.address],
    [tokensPerEther.toString()],
    [ethersPerToken.toString()],
    ['0x0000000000000000000000000000'],
    ['0x0000000000000000000000000000'],
    blockNumber,
    [0]
  );
  await conversionRates.setQtyStepFunction(eur.options.address, [0], [0], [0], [0]);
  await conversionRates.setImbalanceStepFunction(eur.options.address, [0], [0], [0], [0]);
  await kyberNetwork.listPairForReserve(
    kyberReserve.options.address,
    eur.options.address,
    true,
    true,
    true
  );
}
