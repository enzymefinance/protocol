const fs = require('fs');
const web3 = require('./get-web3');
const BigNumber = require('bignumber.js');
const {deploy, fetch, nab, send, call} = require('./deploy-contract');

BigNumber.config({EXPONENTIAL_AT: 1e+9}); // TODO: do in config sourcing?

const deploy_in = './deploy_out.json'; // TODO: rename
const deploy_out = './deploy_out.json'; // TODO: rename

const main = async input => {
  const kyberAddrs = input.kyber.addr;
  const tokens = input.tokens.addr;
  const conf = input.conf;
  const conversionRateAdmin = conf.deployer;
  const kyberNetworkAdmin = conf.deployer;
  const rateDuration = 500;
  const minimalRecordResolution = 2;
  const maxPerBlockImbalance = new BigNumber('10e+29');
  const tokensToTransfer = new BigNumber('10e+23');
  const ethToSend = new BigNumber('10e+22');
  const maxTotalImbalance = maxPerBlockImbalance.times(12);
  const categoryCap = new BigNumber('10e+28')
  const tokensPerEther = new BigNumber('10e+18');
  const ethersPerToken = new BigNumber('10e+18');
  const blockNumber = (await web3.eth.getBlock()).number;

  const mln = fetch('StandardToken', tokens.MLN);
  const eur = fetch('StandardToken', tokens.EUR);

  const kgtToken = await nab('TestToken', ['KGT', 'KGT', 18], kyberAddrs, 'KgtToken');
  const conversionRates = await nab('ConversionRates', [conversionRateAdmin], kyberAddrs);
  const kyberNetwork = await nab('KyberNetwork', [kyberNetworkAdmin], kyberAddrs);
  const kyberReserve = await nab('KyberReserve', [kyberNetwork.options.address, conversionRates.options.address, conf.deployer], kyberAddrs);
  const kyberWhiteList = await nab('KyberWhiteList', [conf.deployer, kgtToken.options.address], kyberAddrs);
  const feeBurner = await nab('FeeBurner', [conf.deployer, mln.options.address, kyberNetwork.options.address], kyberAddrs);
  const expectedRate = await nab('ExpectedRate', [kyberNetwork.options.address, conf.deployer], kyberAddrs);
  const kyberNetworkProxy = await nab('KyberNetworkProxy', [conf.deployer], kyberAddrs);

  await send(kyberNetwork, 'setWhiteList', [kyberWhiteList.options.address]);
  await send(kyberNetworkProxy, 'setKyberNetworkContract', [kyberNetwork.options.address]);
  await send(kyberNetwork, 'setExpectedRate', [expectedRate.options.address]);
  await send(kyberNetwork, 'setFeeBurner', [feeBurner.options.address]);
  await send(kyberNetwork, 'setKyberProxy', [kyberNetworkProxy.options.address]);
  await send(kyberNetwork, 'setEnable', [true]);
  await send(conversionRates, 'setValidRateDurationInBlocks', [rateDuration]);
  await send(conversionRates, 'addToken', [mln.options.address]);
  await send(conversionRates, 'setTokenControlInfo', [mln.options.address, minimalRecordResolution, maxPerBlockImbalance.toString(), maxTotalImbalance.toString()]);
  await send(conversionRates, 'enableTokenTrade', [mln.options.address]);
  await send(conversionRates, 'setReserveAddress', [kyberReserve.options.address]);
  await send(kyberNetwork, 'addReserve', [kyberReserve.options.address, true]);
  await send(kyberReserve, 'approveWithdrawAddress', [mln.options.address, conf.deployer, true]);
  await send(kyberReserve, 'enableTrade');

  await send(mln, 'transfer', [kyberReserve.options.address, tokensToTransfer.toString()]);
  await send(conversionRates, 'addOperator', [conf.deployer]);
  await send(conversionRates, 'setBaseRate', [[mln.options.address], [tokensPerEther.toString()], [ethersPerToken.toString()], ['0x0000000000000000000000000000'], ['0x0000000000000000000000000000'], blockNumber, [0]]);
  await send(conversionRates, 'setQtyStepFunction', [mln.options.address, [0], [0], [0], [0]]);
  await send(conversionRates, 'setImbalanceStepFunction', [mln.options.address, [0], [0], [0], [0]]);
  await send(kyberWhiteList, 'addOperator', [conf.deployer]);
  await send(kyberWhiteList, 'setCategoryCap', [0, categoryCap.toString()]);
  await send(kyberWhiteList, 'setSgdToEthRate', [30000]);

  await send(kyberReserve, undefined, [], { value: ethToSend.toString() });
  await send(kyberReserve, 'setContracts', [kyberNetwork.options.address, conversionRates.options.address, '0x0000000000000000000000000000000000000000']);
  await send(kyberNetwork, 'listPairForReserve', [kyberReserve.options.address, mln.options.address, true, true, true]);

  await send(conversionRates, 'addToken', [eur.options.address]);
  await send(conversionRates, 'setTokenControlInfo', [eur.options.address, minimalRecordResolution, maxPerBlockImbalance.toString(), maxTotalImbalance.toString()]);
  await send(conversionRates, 'enableTokenTrade', [eur.options.address]);
  await send(kyberReserve, 'approveWithdrawAddress', [eur.options.address, conf.deployer, true]);

  await send(eur, 'transfer', [kyberReserve.options.address, tokensToTransfer.toString()]);
  await send(conversionRates, 'setBaseRate', [[eur.options.address], [tokensPerEther.toString()], [ethersPerToken.toString()], ['0x000000000000000000000000000'], ['0x0000000000000000000000000000'], blockNumber, [0]]);
  await send(conversionRates, 'setQtyStepFunction', [eur.options.address, [0], [0], [0], [0]]);
  await send(conversionRates, 'setImbalanceStepFunction', [eur.options.address, [0], [0], [0], [0]]);
  await send(kyberNetwork, 'listPairForReserve', [kyberReserve.options.address, eur.options.address, true, true, true]);

  return {
    "KGT": kgtToken.options.address,
    "ConversionRates": conversionRates.options.address,
    "KyberReserve": kyberReserve.options.address,
    "KyberNetwork": kyberNetwork.options.address,
    "KyberNetworkProxy": kyberNetworkProxy.options.address,
    "KyberWhiteList": kyberWhiteList.options.address,
    "ExpectedRate": expectedRate.options.address,
    "FeeBurner": feeBurner.options.address,
  };
}

if (require.main === module) {
  const input = JSON.parse(fs.readFileSync(deploy_in, 'utf8'));
  main(input).then(addrs => {
    const output = Object.assign({}, input);
    output.kyber.addr = addrs;
    fs.writeFileSync(deploy_out, JSON.stringify(output, null, '  '));
    console.log(`Written to ${deploy_out}`);
    console.log(addrs);
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1) });
}

module.exports = main;
