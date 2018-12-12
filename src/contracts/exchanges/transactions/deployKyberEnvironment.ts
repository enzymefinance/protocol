import { Environment, LogLevels } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { default as BigNumber } from 'bignumber.js';
1;
import { Contracts } from '~/Contracts';
import { TokenInterface } from '@melonproject/token-math/token';

/* eslint no-bitwise: ["error", { "allow": ["&"] }] */
function bytesToHex(byteArray) {
  const strNum = Array.from(byteArray, (byte: any) =>
    `0${(byte & 0xff).toString(16)}`.slice(-2),
  ).join('');
  const num = `0x${strNum}`;
  return num;
}

export interface KyberEnvironment {
  conversionRates: string;
  kyberNetwork: string;
  kyberNetworkProxy: string;
}

export const deployKyberEnvironment = async (
  environment: Environment,
  tokens: TokenInterface[],
): Promise<KyberEnvironment> => {
  const debug = environment.logger(
    'melon:protocol:exchanges:deploy-kyber',
    LogLevels.DEBUG,
  );
  const deployer = environment.wallet.address.toString();
  // const address = await deployContract(
  //   'KyberNetwork.sol',
  //   [],
  //   environment,
  // );

  // return address;

  // const opts = {
  //   from: deployer,
  //   gas: 8000000,
  //   gasPrice: 10,
  // };

  const [mlnToken, eurToken] = tokens;

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

  const conversionRates = getContract(
    environment,
    Contracts.ConversionRates,
    await deployContract(environment, Contracts.ConversionRates, [deployer]),
  );

  const kgtTokenAddress = await deployContract(environment, 'TestToken', [
    'KGT',
    'KGT',
    18,
  ]);
  const kyberNetworkContract = getContract(
    environment,
    Contracts.KyberNetwork,
    await deployContract(environment, Contracts.KyberNetwork, [deployer]),
  );

  await conversionRates.methods
    .setValidRateDurationInBlocks(validRateDurationInBlocks)
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .addToken(mlnToken.address)
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .setTokenControlInfo(
      mlnToken.address,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance,
    )
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .enableTokenTrade(mlnToken.address)
    .send({ from: deployer, gas: 8000000 });
  const kyberReserveContract = getContract(
    environment,
    Contracts.KyberReserve,
    await deployContract(environment, Contracts.KyberReserve, [
      kyberNetworkContract.options.address,
      conversionRates.options.address,
      deployer,
    ]),
  );
  await conversionRates.methods
    .setReserveAddress(kyberReserveContract.options.address)
    .send({ from: deployer, gas: 8000000 });
  await kyberNetworkContract.methods
    .addReserve(kyberReserveContract.options.address, true)
    .send({ from: deployer, gas: 8000000 });
  await kyberReserveContract.methods
    .approveWithdrawAddress(mlnToken.address, deployer, true)
    .send({ from: deployer, gas: 8000000 });
  await kyberReserveContract.methods
    .enableTrade()
    .send({ from: deployer, gas: 8000000 });

  const mlnTokenContract = getContract(
    environment,
    Contracts.PreminedToken,
    mlnToken.address,
  );

  // Set pricing for Token
  await mlnTokenContract.methods
    .transfer(
      kyberReserveContract.options.address,
      new BigNumber(10 ** 23).toFixed(),
    )
    .send({ from: deployer, gas: 8000000 });
  const mlnPrice = new BigNumber(10 ** 18); // Arbritrary for now
  const ethersPerToken = mlnPrice.toFixed();
  const tokensPerEther = new BigNumber(precisionUnits)
    .mul(precisionUnits)
    .div(ethersPerToken)
    .toFixed(0);
  baseBuyRate1.push(tokensPerEther);
  baseSellRate1.push(ethersPerToken);
  const currentBlock = await environment.eth.getBlockNumber();
  await conversionRates.methods
    .addOperator(deployer)
    .send({ from: deployer, gas: 8000000 });

  debug('setBaseRate', [
    [mlnToken.address],
    baseBuyRate1,
    baseSellRate1,
    buys,
    sells,
    currentBlock,
    indices,
  ]);
  await conversionRates.methods
    .setBaseRate(
      [mlnToken.address],
      baseBuyRate1,
      baseSellRate1,
      buys,
      sells,
      currentBlock,
      indices,
    )
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .setQtyStepFunction(mlnToken.address, [0], [0], [0], [0])
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .setImbalanceStepFunction(mlnToken.address, [0], [0], [0], [0])
    .send({ from: deployer, gas: 8000000 });

  const kyberWhiteListContract = getContract(
    environment,
    Contracts.KyberWhiteList,
    await deployContract(environment, Contracts.KyberWhiteList, [
      deployer,
      kgtTokenAddress.toString(),
    ]),
  );
  await kyberWhiteListContract.methods
    .addOperator(deployer)
    .send({ from: deployer, gas: 8000000 });
  await kyberWhiteListContract.methods
    .setCategoryCap(0, new BigNumber(10 ** 28).toFixed())
    .send({ from: deployer, gas: 8000000 });
  await kyberWhiteListContract.methods
    .setSgdToEthRate(30000)
    .send({ from: deployer, gas: 8000000 });

  const feeBurnerAddress = await deployContract(environment, 'FeeBurner', [
    deployer,
    mlnToken.address,
    kyberNetworkContract.options.address,
  ]);
  const expectedRateAddress = await deployContract(
    environment,
    'ExpectedRate',
    [kyberNetworkContract.options.address, deployer],
  );

  await environment.eth.sendTransaction({
    from: deployer,
    to: kyberReserveContract.options.address,
    value: new BigNumber(10 ** 24),
  });
  await kyberReserveContract.methods
    .setContracts(
      kyberNetworkContract.options.address,
      conversionRates.options.address,
      '0x0000000000000000000000000000000000000000',
    )
    .send({ from: deployer, gas: 8000000 });

  const kyberNetworkProxyContract = getContract(
    environment,
    Contracts.KyberNetworkProxy,
    await deployContract(environment, Contracts.KyberNetworkProxy, [deployer]),
  );
  await kyberNetworkProxyContract.methods
    .setKyberNetworkContract(kyberNetworkContract.options.address)
    .send({ from: deployer, gas: 8000000 });
  await kyberNetworkContract.methods
    .setWhiteList(kyberWhiteListContract.options.address)
    .send({ from: deployer, gas: 8000000 });
  await kyberNetworkContract.methods
    .setExpectedRate(expectedRateAddress.toString())
    .send({ from: deployer, gas: 8000000 });
  await kyberNetworkContract.methods
    .setFeeBurner(feeBurnerAddress.toString())
    .send({ from: deployer, gas: 8000000 });
  await kyberNetworkContract.methods
    .setKyberProxy(kyberNetworkProxyContract.options.address)
    .send({ from: deployer, gas: 8000000 });
  await kyberNetworkContract.methods
    .setEnable(true)
    .send({ from: deployer, gas: 8000000 });
  await kyberNetworkContract.methods
    .listPairForReserve(
      kyberReserveContract.options.address,
      mlnToken.address.toString(),
      true,
      true,
      true,
    )
    .send({ from: deployer, gas: 8000000 });
  // // Add Eur Token
  const eurTokenContract = getContract(
    environment,
    Contracts.PreminedToken,
    eurToken.address,
  );
  await conversionRates.methods
    .addToken(eurToken.address)
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .setTokenControlInfo(
      eurToken.address,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance,
    )
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .enableTokenTrade(eurToken.address)
    .send({ from: deployer, gas: 8000000 });
  await kyberReserveContract.methods
    .approveWithdrawAddress(eurToken.address, deployer, true)
    .send({ from: deployer, gas: 8000000 });
  await eurTokenContract.methods
    .transfer(
      kyberReserveContract.options.address,
      new BigNumber(10 ** 23).toFixed(),
    )
    .send({ from: deployer, gas: 8000000 });
  const eurPrice = new BigNumber(10 ** 18); // Arbritrary for now
  const ethersPerEurToken = eurPrice.toFixed();
  const eurTokensPerEther = new BigNumber(precisionUnits)
    .mul(precisionUnits)
    .div(ethersPerEurToken)
    .toFixed(0);
  await conversionRates.methods
    .setBaseRate(
      [eurToken.address],
      [eurTokensPerEther],
      [ethersPerEurToken],
      buys,
      sells,
      currentBlock,
      indices,
    )
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .setQtyStepFunction(eurToken.address, [0], [0], [0], [0])
    .send({ from: deployer, gas: 8000000 });
  await conversionRates.methods
    .setImbalanceStepFunction(eurToken.address, [0], [0], [0], [0])
    .send({ from: deployer, gas: 8000000 });
  await kyberNetworkContract.methods
    .listPairForReserve(
      kyberReserveContract.options.address,
      eurToken.address,
      true,
      true,
      true,
    )
    .send({ from: deployer, gas: 8000000 });

  // TODO
  // await governanceAction(
  //   { from: deployer },
  //   Governance,
  //   canonicalPriceFeed,
  //   "registerExchange",
  //   [
  //     KyberNetworkProxy.options.address,
  //     KyberAdapter.options.address,
  //     true,
  //     [takeOrderSignature],
  //   ],
  // );
  return {
    conversionRates: conversionRates.options.address,
    kyberNetwork: kyberNetworkContract.options.address,
    kyberNetworkProxy: kyberNetworkProxyContract.options.address,
  };
};
