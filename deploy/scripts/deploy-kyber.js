const {call, fetchContract, nab, send} = require('../utils/deploy-contract');
const web3 = require('../utils/get-web3');
const BN = web3.utils.BN;

// TODO: check whether each "send" needs to be done before sending it
const main = async input => {
  const kyberAddrs = input.kyber.addr;
  const conf = input.conf;
  const conversionRateAdmin = conf.deployer;
  const kyberNetworkAdmin = conf.deployer;
  const rateDuration = 500000;
  const minimalRecordResolution = 2;
  const maxPerBlockImbalance = new BN(10).pow(new BN(29));
  const tokensToTransfer = new BN(10).pow(new BN(23));
  const ethToSend = input.kyber.conf.initialReserveAmount;
  const maxTotalImbalance = maxPerBlockImbalance.mul(new BN(12));
  const categoryCap = new BN(10).pow(new BN(28));
  const tokensPerEther = new BN(10).pow(new BN(18));
  const ethersPerToken = new BN(10).pow(new BN(18));
  const blockNumber = (await web3.eth.getBlock('latest')).number;

  const mln = fetchContract('StandardToken', input.tokens.addr.MLN);
  const eur = fetchContract('StandardToken', input.tokens.addr.EUR);
  const knc = fetchContract('StandardToken', input.tokens.addr.KNC);

  const kgtToken = await nab('BurnableToken', ['KGT', 18, 'Kyber Token'], kyberAddrs, 'KGT');
  const conversionRates = await nab('ConversionRates', [conversionRateAdmin], kyberAddrs);
  const kyberNetwork = await nab('KyberNetwork', [kyberNetworkAdmin], kyberAddrs);
  const kyberReserve = await nab('KyberReserve', [kyberNetwork.options.address, conversionRates.options.address, conf.deployer], kyberAddrs);
  const kyberWhiteList = await nab('WhiteList', [conf.deployer, kgtToken.options.address], kyberAddrs, 'KyberWhiteList');
  const feeBurner = await nab('FeeBurner', [conf.deployer, knc.options.address, kyberNetwork.options.address, 18], kyberAddrs);
  const expectedRate = await nab('ExpectedRate', [kyberNetwork.options.address, knc.options.address, conf.deployer], kyberAddrs);
  const kyberNetworkProxy = await nab('KyberNetworkProxy', [conf.deployer], kyberAddrs);

  const kyberNetworkContractFromProxy = await call(kyberNetworkProxy, 'kyberNetworkContract');
  if (`${kyberNetworkContractFromProxy}`.toLowerCase() !== kyberNetwork.options.address.toLowerCase()) {
    await send(kyberNetworkProxy, 'setKyberNetworkContract', [kyberNetwork.options.address]);
  }
  const whitelistOnNetwork = await call(kyberNetwork, 'whiteListContract');
  if (`${whitelistOnNetwork}`.toLowerCase() !== kyberWhiteList.options.address.toLowerCase()) {
    await send(kyberNetwork, 'setWhiteList', [kyberWhiteList.options.address]);
  }
  const rateOnKyber = await call(kyberNetwork, 'expectedRateContract');
  if (`${rateOnKyber}`.toLowerCase() !== expectedRate.options.address.toLowerCase()) {
    await send(kyberNetwork, 'setExpectedRate', [expectedRate.options.address]);
  }
  const feeBurnerOnNetwork = await call(kyberNetwork, 'feeBurnerContract');
  if (`${feeBurnerOnNetwork}`.toLowerCase() !== feeBurner.options.address.toLowerCase()) {
    await send(kyberNetwork, 'setFeeBurner', [feeBurner.options.address]);
  }
  const proxyOnNetwork = await call(kyberNetwork, 'kyberNetworkProxyContract');
  if (`${proxyOnNetwork}`.toLowerCase() !== kyberNetworkProxy.options.address.toLowerCase()) {
    await send(kyberNetwork, 'setKyberProxy', [kyberNetworkProxy.options.address]);
  }
  const kyberNetworkEnabled = await call(kyberNetwork, 'isEnabled');
  if (!kyberNetworkEnabled) {
    await send(kyberNetwork, 'setEnable', [true]);
  }
  const previousRateDuration = await call(conversionRates, 'validRateDurationInBlocks');
  if (previousRateDuration !== rateDuration) {
    await send(conversionRates, 'setValidRateDurationInBlocks', [rateDuration]);
  }
  const mlnData = await call(conversionRates, 'getTokenBasicData', [mln.options.address]);
  if (!mlnData || !mlnData['0']) {
    await send(conversionRates, 'addToken', [mln.options.address]);
  }
  await send(conversionRates, 'setTokenControlInfo', [mln.options.address, minimalRecordResolution, maxPerBlockImbalance.toString(), maxTotalImbalance.toString()]);
  await send(conversionRates, 'enableTokenTrade', [mln.options.address]);
  await send(conversionRates, 'setReserveAddress', [kyberReserve.options.address]);
  const kyberNetworkOperators = (await call(kyberNetwork, 'getOperators')) || [];
  if (kyberNetworkOperators.map(s => s.toLowerCase()).indexOf(conf.deployer.toLowerCase()) === -1) {
    await send(kyberNetwork, 'addOperator', [conf.deployer]);
  }

  const reserveType = await call(kyberNetwork, 'reserveType', [kyberReserve.options.address]);
  if (`${reserveType}` === '0') {
    await send(kyberNetwork, 'addReserve', [kyberReserve.options.address, true]);
  }
  await send(kyberReserve, 'approveWithdrawAddress', [mln.options.address, conf.deployer, true]);
  await send(kyberReserve, 'enableTrade');

  const kyberReserveMlnBalance = await call(mln, 'balanceOf', [kyberReserve.options.address]);
  if (`${kyberReserveMlnBalance}` === '0') {
    await send(mln, 'transfer', [kyberReserve.options.address, tokensToTransfer.toString()]);
  }
  const conversionRateOperators = (await call(conversionRates, 'getOperators')) || [];
  if (conversionRateOperators.map(s => s.toLowerCase()).indexOf(conf.deployer.toLowerCase()) === -1) {
    await send(conversionRates, 'addOperator', [conf.deployer]);
  }
  await send(conversionRates, 'setBaseRate', [[mln.options.address], [tokensPerEther.toString()], [ethersPerToken.toString()], ['0x0000000000000000000000000000'], ['0x0000000000000000000000000000'], blockNumber, [0]]);
  await send(conversionRates, 'setQtyStepFunction', [mln.options.address, [0], [0], [0], [0]]);
  await send(conversionRates, 'setImbalanceStepFunction', [mln.options.address, [0], [0], [0], [0]]);
  const whitelistOperators = (await call(kyberWhiteList, 'getOperators')) || [];
  if (whitelistOperators.map(s => s.toLowerCase()).indexOf(conf.deployer.toLowerCase()) === -1) {
    await send(kyberWhiteList, 'addOperator', [conf.deployer]);
  }
  await send(kyberWhiteList, 'setCategoryCap', [0, categoryCap.toString()]);
  await send(kyberWhiteList, 'setSgdToEthRate', [30000]);

  const reserveBalance = await web3.eth.getBalance(kyberReserve.options.address);
  if (Number(reserveBalance) === 0) {
    await send(kyberReserve, undefined, [], { value: ethToSend.toString() });
  }
  await send(kyberReserve, 'setContracts', [kyberNetwork.options.address, conversionRates.options.address, '0x0000000000000000000000000000000000000000']);
  await send(kyberNetwork, 'listPairForReserve', [kyberReserve.options.address, mln.options.address, true, true, true]);

  const eurData = await call(conversionRates, 'getTokenBasicData', [eur.options.address]);
  if (!eurData || !eurData['0']) {
    await send(conversionRates, 'addToken', [eur.options.address]);
  }
  await send(conversionRates, 'setTokenControlInfo', [eur.options.address, minimalRecordResolution, maxPerBlockImbalance.toString(), maxTotalImbalance.toString()]);
  await send(conversionRates, 'enableTokenTrade', [eur.options.address]);
  await send(kyberReserve, 'approveWithdrawAddress', [eur.options.address, conf.deployer, true]);

  const kyberReserveEurBalance = await call(eur, 'balanceOf', [kyberReserve.options.address]);
  if (kyberReserveEurBalance.toString() === '0') {
    await send(eur, 'transfer', [kyberReserve.options.address, tokensToTransfer.toString()]);
  }
  await send(conversionRates, 'setBaseRate', [[eur.options.address], [tokensPerEther.toString()], [ethersPerToken.toString()], ['0x000000000000000000000000000'], ['0x0000000000000000000000000000'], blockNumber, [0]]);
  await send(conversionRates, 'setQtyStepFunction', [eur.options.address, [0], [0], [0], [0]]);
  await send(conversionRates, 'setImbalanceStepFunction', [eur.options.address, [0], [0], [0], [0]]);
  await send(kyberNetwork, 'listPairForReserve', [kyberReserve.options.address, eur.options.address, true, true, true]);

  return {
    "KGT": kgtToken,
    "ConversionRates": conversionRates,
    "KyberReserve": kyberReserve,
    "KyberNetwork": kyberNetwork,
    "KyberNetworkProxy": kyberNetworkProxy,
    "KyberWhiteList": kyberWhiteList,
    "ExpectedRate": expectedRate,
    "FeeBurner": feeBurner,
  };
}

module.exports = main;
