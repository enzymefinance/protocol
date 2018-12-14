import web3 from '../../utils/lib/web3';
import { deployContract, retrieveContract } from '../lib/contracts';

const BigNumber = require('bignumber.js');

/* eslint no-bitwise: ["error", { "allow": ["&"] }] */
function bytesToHex(byteArray) {
  const strNum = Array.from(byteArray, byte =>
    `0${(byte & 0xff).toString(16)}`.slice(-2),
  ).join('');
  const num = `0x${strNum}`;
  return num;
}

async function setupKyberDevEnv(preKyberDeployed, accounts) {
  // Setup Kyber env
  const opts = {
    from: accounts[0],
    gas: 8000000,
    gasPrice: 10,
  };

  const minimalRecordResolution = 2;
  const maxPerBlockImbalance = new BigNumber(10 ** 29).toFixed();
  const validRateDurationInBlocks = 50;
  const precisionUnits = new BigNumber(10).pow(18).toFixed();
  const maxTotalImbalance = new BigNumber(maxPerBlockImbalance)
    .mul(12)
    .toFixed();

  // base buy and sell rates (prices)
  const baseBuyRate1 = [];
  const baseSellRate1 = [];

  // compact data.
  const sells = [bytesToHex(0)];
  const buys = [bytesToHex(0)];
  const indices = [0];
  const deployed = { ...preKyberDeployed };

  deployed.ConversionRates = await deployContract(
    'ConversionRates',
    opts,
    [accounts[0]],
  );
  const mlnToken = deployed.MlnToken;
  const eurToken = deployed.EurToken;
  deployed.KGTToken = await deployContract(
    'TestToken',
    opts,
    ['KGT', 'KGT', 18],
  );
  deployed.KyberNetwork = await deployContract(
    'KyberNetwork',
    opts,
    [accounts[0]],
  );
  await deployed.ConversionRates.methods
    .setValidRateDurationInBlocks(validRateDurationInBlocks)
    .send();
  await deployed.ConversionRates.methods
    .addToken(mlnToken.options.address)
    .send();
  await deployed.ConversionRates.methods
    .setTokenControlInfo(
      mlnToken.options.address,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance,
    )
    .send();
  await deployed.ConversionRates.methods
    .enableTokenTrade(mlnToken.options.address)
    .send();
  deployed.KyberReserve = await deployContract(
    'KyberReserve',
    opts,
    [
      deployed.KyberNetwork.options.address,
      deployed.ConversionRates.options.address,
      accounts[0],
    ],
  );
  await deployed.ConversionRates.methods
    .setReserveAddress(deployed.KyberReserve.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .addReserve(deployed.KyberReserve.options.address, true)
    .send();
  await deployed.KyberReserve.methods
    .approveWithdrawAddress(mlnToken.options.address, accounts[0], true)
    .send();
  await deployed.KyberReserve.methods.enableTrade().send();

  // Set pricing for Token
  await mlnToken.methods
    .transfer(
      deployed.KyberReserve.options.address,
      new BigNumber(10 ** 23).toFixed(),
    )
    .send();
  const mlnPrice = new BigNumber(10 ** 18); // Arbritrary for now
  const ethersPerToken = mlnPrice.toFixed();
  const tokensPerEther = new BigNumber(precisionUnits)
    .mul(precisionUnits)
    .div(ethersPerToken)
    .toFixed(0);
  baseBuyRate1.push(tokensPerEther);
  baseSellRate1.push(ethersPerToken);
  const currentBlock = await web3.eth.getBlockNumber();
  await deployed.ConversionRates.methods.addOperator(accounts[0]).send();
  await deployed.ConversionRates.methods
    .setBaseRate(
      [mlnToken.options.address],
      baseBuyRate1,
      baseSellRate1,
      buys,
      sells,
      currentBlock,
      indices,
    )
    .send();
  await deployed.ConversionRates.methods
    .setQtyStepFunction(mlnToken.options.address, [0], [0], [0], [0])
    .send();
  await deployed.ConversionRates.methods
    .setImbalanceStepFunction(mlnToken.options.address, [0], [0], [0], [0])
    .send();

  deployed.KyberWhiteList = await deployContract(
    'KyberWhiteList',
    opts,
    [accounts[0], deployed.KGTToken.options.address],
  );
  await deployed.KyberWhiteList.methods.addOperator(accounts[0]).send();
  await deployed.KyberWhiteList.methods
    .setCategoryCap(0, new BigNumber(10 ** 28).toFixed())
    .send();
  await deployed.KyberWhiteList.methods.setSgdToEthRate(30000).send();

  deployed.FeeBurner = await deployContract(
    'FeeBurner',
    opts,
    [
      accounts[0],
      mlnToken.options.address,
      deployed.KyberNetwork.options.address,
    ],
  );
  deployed.ExpectedRate = await deployContract(
    'ExpectedRate',
    opts,
    [deployed.KyberNetwork.options.address, accounts[0]],
  );

  await web3.eth.sendTransaction({
    to: deployed.KyberReserve.options.address,
    from: accounts[0],
    value: new BigNumber(10 ** 24),
  });
  await deployed.KyberReserve.methods
    .setContracts(
      deployed.KyberNetwork.options.address,
      deployed.ConversionRates.options.address,
      '0x0000000000000000000000000000000000000000',
    )
    .send();
  await deployed.KyberNetworkProxy.methods
    .setKyberNetworkContract(deployed.KyberNetwork.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .setWhiteList(deployed.KyberWhiteList.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .setExpectedRate(deployed.ExpectedRate.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .setFeeBurner(deployed.FeeBurner.options.address)
    .send();
  await deployed.KyberNetwork.methods
    .setKyberProxy(deployed.KyberNetworkProxy.options.address)
    .send();
  await deployed.KyberNetwork.methods.setEnable(true).send();
  await deployed.KyberNetwork.methods
    .listPairForReserve(
      deployed.KyberReserve.options.address,
      mlnToken.options.address,
      true,
      true,
      true,
    )
    .send();
  // Add Eur Token
  await deployed.ConversionRates.methods
    .addToken(eurToken.options.address)
    .send();
  await deployed.ConversionRates.methods
    .setTokenControlInfo(
      eurToken.options.address,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance,
    )
    .send();
  await deployed.ConversionRates.methods
    .enableTokenTrade(eurToken.options.address)
    .send();
  await deployed.KyberReserve.methods
    .approveWithdrawAddress(eurToken.options.address, accounts[0], true)
    .send();
  await eurToken.methods
    .transfer(
      deployed.KyberReserve.options.address,
      new BigNumber(10 ** 23).toFixed(),
    )
    .send();
  const eurPrice = new BigNumber(10 ** 18); // Arbritrary for now
  const ethersPerEurToken = eurPrice.toFixed();
  const eurTokensPerEther = new BigNumber(precisionUnits)
    .mul(precisionUnits)
    .div(ethersPerEurToken)
    .toFixed(0);
  await deployed.ConversionRates.methods
    .setBaseRate(
      [eurToken.options.address],
      [eurTokensPerEther],
      [ethersPerEurToken],
      buys,
      sells,
      currentBlock,
      indices,
    )
    .send();
  await deployed.ConversionRates.methods
    .setQtyStepFunction(eurToken.options.address, [0], [0], [0], [0])
    .send();
  await deployed.ConversionRates.methods
    .setImbalanceStepFunction(eurToken.options.address, [0], [0], [0], [0])
    .send();
  await deployed.KyberNetwork.methods
    .listPairForReserve(
      deployed.KyberReserve.options.address,
      eurToken.options.address,
      true,
      true,
      true,
    )
    .send();

  // Melon Fund env
  deployed.KyberAdapter = await deployContract('KyberAdapter', opts);
  // TODO
  // await governanceAction(
  //   { from: accounts[0] },
  //   deployed.Governance,
  //   deployed.CanonicalPriceFeed,
  //   "registerExchange",
  //   [
  //     deployed.KyberNetworkProxy.options.address,
  //     deployed.KyberAdapter.options.address,
  //     true,
  //     [takeOrderSignature],
  //   ],
  // );
  return deployed;
}

export { bytesToHex, setupKyberDevEnv };
