import { default as BigNumber } from 'bignumber.js';
import {
  TokenInterface,
  createQuantity,
  createPrice,
} from '@melonproject/token-math';

import { Environment, LogLevels } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { sendEth } from '~/utils/evm/sendEth';
import { setValidRateDurationInBlocks } from '~/contracts/exchanges/third-party/kyber/transactions/setValidRateDurationInBlocks';
import { setTokenControlInfo } from '~/contracts/exchanges/third-party/kyber/transactions/setTokenControlInfo';
import { enableTokenTrade } from '~/contracts/exchanges/third-party/kyber/transactions/enableTokenTrade';
import { setReserveAddress } from '~/contracts/exchanges/third-party/kyber/transactions/setReserveAddress';
import { addToken } from '~/contracts/exchanges/third-party/kyber/transactions/addToken';
import { addReserve } from '~/contracts/exchanges/third-party/kyber/transactions/addReserve';
import { approveWithdrawAddress } from '~/contracts/exchanges/third-party/kyber/transactions/approveWithdrawAddress';
import { enableTrade } from '~/contracts/exchanges/third-party/kyber/transactions/enableTrade';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { setBaseRate } from '~/contracts/exchanges/third-party/kyber/transactions/setBaseRate';
import { addOperator } from '~/contracts/exchanges/third-party/kyber/transactions/addOperator';
import { setQtyStepFunction } from '~/contracts/exchanges/third-party/kyber/transactions/setQtyStepFunction';
import { setImbalanceStepFunction } from '~/contracts/exchanges/third-party/kyber/transactions/setImbalanceStepFunction';
import { setCategoryCap } from '~/contracts/exchanges/third-party/kyber/transactions/setCategoryCap';
import { setSgdToEthRate } from '~/contracts/exchanges/third-party/kyber/transactions/setSgdToEthRate';
import { setContracts } from '~/contracts/exchanges/third-party/kyber/transactions/setContracts';
import { setKyberNetworkContract } from '~/contracts/exchanges/third-party/kyber/transactions/setKyberNetworkContract';
import { setWhiteList } from '~/contracts/exchanges/third-party/kyber/transactions/setWhiteList';
import { setExpectedRate } from '~/contracts/exchanges/third-party/kyber/transactions/setExpectedRate';
import { setFeeBurner } from '~/contracts/exchanges/third-party/kyber/transactions/setFeeBurner';
import { setKyberProxy } from '~/contracts/exchanges/third-party/kyber/transactions/setKyberProxy';
import { setEnable } from '~/contracts/exchanges/third-party/kyber/transactions/setEnable';
import { listPairForReserve } from '~/contracts/exchanges/third-party/kyber/transactions/listPairForReserve';
import { getChainName } from '~/utils/environment/chainName';
import { Contracts } from '~/Contracts';

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

  const [mlnToken, eurToken, weth] = tokens;

  const minimalRecordResolution = 2;
  const maxPerBlockImbalance = new BigNumber(10 ** 29).toFixed();
  const validRateDurationInBlocks = 500;
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

  await setValidRateDurationInBlocks(
    environment,
    conversionRates.options.address,
    { duration: validRateDurationInBlocks },
  );
  await addToken(environment, conversionRates.options.address, {
    token: mlnToken.address,
  });
  await setTokenControlInfo(environment, conversionRates.options.address, {
    token: mlnToken.address,
    minimalRecordResolution: minimalRecordResolution,
    maxPerBlockImbalance: maxPerBlockImbalance,
    maxTotalImbalance: maxTotalImbalance,
  });
  await enableTokenTrade(environment, conversionRates.options.address, {
    token: mlnToken.address,
  });
  const kyberReserveContract = getContract(
    environment,
    Contracts.KyberReserve,
    await deployContract(environment, Contracts.KyberReserve, [
      kyberNetworkContract.options.address,
      conversionRates.options.address,
      deployer,
    ]),
  );
  await setReserveAddress(environment, conversionRates.options.address, {
    reserve: kyberReserveContract.options.address,
  });

  await addReserve(environment, kyberNetworkContract.options.address, {
    reserve: kyberReserveContract.options.address,
    add: true,
  });

  await approveWithdrawAddress(
    environment,
    kyberReserveContract.options.address,
    {
      token: mlnToken.address,
      addr: deployer,
      approve: true,
    },
  );

  await enableTrade(environment, kyberReserveContract.options.address);

  // Set pricing for Token
  await transfer(environment, {
    howMuch: createQuantity(mlnToken, 100000),
    to: kyberReserveContract.options.address,
  });

  const currentBlock = await environment.eth.getBlockNumber();

  await addOperator(environment, conversionRates.options.address, {
    newOperator: deployer,
  });

  const mlnPrices = [
    {
      buy: createPrice(createQuantity(weth, 1), createQuantity(mlnToken, 1)),
      sell: createPrice(createQuantity(mlnToken, 1), createQuantity(weth, 1)),
    },
  ];

  debug('setBaseRate', [
    [mlnToken.address],
    baseBuyRate1,
    baseSellRate1,
    buys,
    sells,
    currentBlock,
    indices,
  ]);

  await setBaseRate(environment, conversionRates.options.address, {
    prices: mlnPrices,
  });

  await setQtyStepFunction(environment, conversionRates.options.address, {
    token: mlnToken.address,
    xBuy: [0],
    yBuy: [0],
    xSell: [0],
    ySell: [0],
  });
  await setImbalanceStepFunction(environment, conversionRates.options.address, {
    token: mlnToken.address,
    xBuy: [0],
    yBuy: [0],
    xSell: [0],
    ySell: [0],
  });

  const kyberWhiteListContract = getContract(
    environment,
    Contracts.KyberWhiteList,
    await deployContract(environment, Contracts.KyberWhiteList, [
      deployer,
      kgtTokenAddress.toString(),
    ]),
  );

  await addOperator(environment, kyberWhiteListContract.options.address, {
    newOperator: deployer,
  });

  await setCategoryCap(environment, kyberWhiteListContract.options.address, {
    category: 0,
    sgdCap: new BigNumber(10 ** 28).toFixed(),
  });

  await setSgdToEthRate(environment, kyberWhiteListContract.options.address, {
    _sgdToWeiRate: 30000,
  });

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

  const chainName = await getChainName(environment);

  let ethSendAmount;
  if (chainName == 'development') {
    ethSendAmount = 10000;
  } else {
    ethSendAmount = 1; // NB: adjust as necessary
  }

  await sendEth(environment, {
    howMuch: createQuantity('ETH', ethSendAmount),
    to: kyberReserveContract.options.address,
  });

  await setContracts(environment, kyberReserveContract.options.address, {
    _kyberNetwork: kyberNetworkContract.options.address,
    _conversionRates: conversionRates.options.address,
    _sanityRates: '0x0000000000000000000000000000000000000000',
  });

  const kyberNetworkProxyContract = getContract(
    environment,
    Contracts.KyberNetworkProxy,
    await deployContract(environment, Contracts.KyberNetworkProxy, [deployer]),
  );

  await setKyberNetworkContract(
    environment,
    kyberNetworkProxyContract.options.address,
    { _kyberNetworkContract: kyberNetworkContract.options.address },
  );

  await setWhiteList(environment, kyberNetworkContract.options.address, {
    whitelist: kyberWhiteListContract.options.address,
  });

  await setExpectedRate(environment, kyberNetworkContract.options.address, {
    expectedRate: expectedRateAddress.toString(),
  });

  await setFeeBurner(environment, kyberNetworkContract.options.address, {
    feeBurner: feeBurnerAddress.toString(),
  });

  await setKyberProxy(environment, kyberNetworkContract.options.address, {
    networkProxy: kyberNetworkProxyContract.options.address,
  });

  await setEnable(environment, kyberNetworkContract.options.address, {
    _enable: true,
  });

  await listPairForReserve(environment, kyberNetworkContract.options.address, {
    reserve: kyberReserveContract.options.address,
    token: mlnToken.address.toString(),
    ethToToken: true,
    tokenToEth: true,
    add: true,
  });

  // Add Eur Token
  await addToken(environment, conversionRates.options.address, {
    token: eurToken.address,
  });

  await setTokenControlInfo(environment, conversionRates.options.address, {
    token: eurToken.address,
    minimalRecordResolution: minimalRecordResolution,
    maxPerBlockImbalance: maxPerBlockImbalance,
    maxTotalImbalance: maxTotalImbalance,
  });

  await enableTokenTrade(environment, conversionRates.options.address, {
    token: eurToken.address,
  });

  await approveWithdrawAddress(
    environment,
    kyberReserveContract.options.address,
    {
      token: eurToken.address,
      addr: deployer,
      approve: true,
    },
  );

  await transfer(environment, {
    howMuch: createQuantity(eurToken, new BigNumber(10 ** 23).toFixed()),
    to: kyberReserveContract.options.address,
  });

  const eurPrices = [
    {
      buy: createPrice(createQuantity(weth, 1), createQuantity(eurToken, 1)),
      sell: createPrice(createQuantity(eurToken, 1), createQuantity(weth, 1)),
    },
  ];

  await setBaseRate(environment, conversionRates.options.address, {
    prices: eurPrices,
  });

  await setQtyStepFunction(environment, conversionRates.options.address, {
    token: eurToken.address,
    xBuy: [0],
    yBuy: [0],
    xSell: [0],
    ySell: [0],
  });
  await setImbalanceStepFunction(environment, conversionRates.options.address, {
    token: eurToken.address,
    xBuy: [0],
    yBuy: [0],
    xSell: [0],
    ySell: [0],
  });

  await listPairForReserve(environment, kyberNetworkContract.options.address, {
    reserve: kyberReserveContract.options.address,
    token: eurToken.address.toString(),
    ethToToken: true,
    tokenToEth: true,
    add: true,
  });

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
