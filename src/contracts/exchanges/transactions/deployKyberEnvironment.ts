import { Environment } from '~/utils/environment/Environment';
import { getContract } from '~/utils/solidity/getContract';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import BigNumber from 'bignumber.js';
import { Contracts } from '~/Contracts';

/* eslint no-bitwise: ["error", { "allow": ["&"] }] */
function bytesToHex(byteArray) {
  const strNum = Array.from(byteArray, (byte: any) =>
    `0${(byte & 0xff).toString(16)}`.slice(-2),
  ).join('');
  const num = `0x${strNum}`;
  return num;
}

export const deployKyberEnvironment = async (
  deployer,
  mlnToken,
  ethToken,
  eurToken,
  environment?: Environment,
) => {
  // const address = await deployContract(
  //   'exchanges/thirdparty/kyber/KyberNetwork.sol',
  //   [],
  //   environment,
  // );

  // return address;

  // const opts = {
  //   from: deployer,
  //   gas: 8000000,
  //   gasPrice: 10,
  // };

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
    Contracts.ConversionRates,
    await deployContract('exchanges/thirdparty/kyber/ConversionRates', [
      deployer,
    ]),
  );

  const KGTTokenAddres = await deployContract(
    'exchanges/thirdparty/kyber/TestToken',
    ['KGT', 'KGT', 18],
  );
  const KyberNetwork = getContract(
    Contracts.KyberNetwork,
    await deployContract('exchanges/thirdparty/kyber/KyberNetwork', [deployer]),
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
  const KyberReserve = getContract(
    Contracts.KyberReserve,
    await deployContract('exchanges/thirdparty/kyber/KyberReserve', [
      KyberNetwork.options.address,
      conversionRates.options.address,
      deployer,
    ]),
  );
  await conversionRates.methods
    .setReserveAddress(KyberReserve.options.address)
    .send({ from: deployer, gas: 8000000 });
  await KyberNetwork.methods
    .addReserve(KyberReserve.options.address, true)
    .send({ from: deployer, gas: 8000000 });
  await KyberReserve.methods
    .approveWithdrawAddress(mlnToken.address, deployer, true)
    .send({ from: deployer, gas: 8000000 });
  await KyberReserve.methods
    .enableTrade()
    .send({ from: deployer, gas: 8000000 });

  const mlnTokenContract = getContract(
    Contracts.PreminedToken,
    mlnToken.address,
    environment,
  );

  // Set pricing for Token
  await mlnTokenContract.methods
    .transfer(KyberReserve.options.address, new BigNumber(10 ** 23).toFixed())
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

  const KyberWhiteList = getContract(
    Contracts.KyberWhiteList,
    await deployContract('exchanges/thirdparty/kyber/KyberWhiteList', [
      deployer,
      KGTTokenAddres,
    ]),
  );
  await KyberWhiteList.methods
    .addOperator(deployer)
    .send({ from: deployer, gas: 8000000 });
  await KyberWhiteList.methods
    .setCategoryCap(0, new BigNumber(10 ** 28).toFixed())
    .send({ from: deployer, gas: 8000000 });
  await KyberWhiteList.methods
    .setSgdToEthRate(30000)
    .send({ from: deployer, gas: 8000000 });

  const feeBurnerAddress = await deployContract(
    'exchanges/thirdparty/kyber/FeeBurner',
    [deployer, mlnToken.address, KyberNetwork.options.address],
  );
  const expectedRateAddress = await deployContract(
    'exchanges/thirdparty/kyber/ExpectedRate',
    [KyberNetwork.options.address, deployer],
  );

  await environment.eth.sendTransaction({
    to: KyberReserve.options.address,
    from: deployer,
    value: new BigNumber(10 ** 24),
  });
  await KyberReserve.methods
    .setContracts(
      KyberNetwork.options.address,
      conversionRates.options.address,
      '0x0000000000000000000000000000000000000000',
    )
    .send({ from: deployer, gas: 8000000 });

  const KyberNetworkProxy = getContract(
    Contracts.KyberNetworkProxy,
    await deployContract(
      'exchanges/thirdparty/kyber/KyberNetworkProxy.sol',
      [deployer],
      environment,
    ),
  );
  await KyberNetworkProxy.methods
    .setKyberNetworkContract(KyberNetwork.options.address)
    .send({ from: deployer, gas: 8000000 });
  await KyberNetwork.methods
    .setWhiteList(KyberWhiteList.options.address)
    .send({ from: deployer, gas: 8000000 });
  await KyberNetwork.methods
    .setExpectedRate(expectedRateAddress)
    .send({ from: deployer, gas: 8000000 });
  await KyberNetwork.methods
    .setFeeBurner(feeBurnerAddress)
    .send({ from: deployer, gas: 8000000 });
  await KyberNetwork.methods
    .setKyberProxy(KyberNetworkProxy.options.address)
    .send({ from: deployer, gas: 8000000 });
  await KyberNetwork.methods
    .setEnable(true)
    .send({ from: deployer, gas: 8000000 });
  await KyberNetwork.methods
    .listPairForReserve(
      KyberReserve.options.address,
      mlnToken.address,
      true,
      true,
      true,
    )
    .send({ from: deployer, gas: 8000000 });
  // // Add Eur Token
  const eurTokenContract = getContract(
    Contracts.PreminedToken,
    eurToken.address,
    environment,
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
  await KyberReserve.methods
    .approveWithdrawAddress(eurToken.address, deployer, true)
    .send({ from: deployer, gas: 8000000 });
  await eurTokenContract.methods
    .transfer(KyberReserve.options.address, new BigNumber(10 ** 23).toFixed())
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
  await KyberNetwork.methods
    .listPairForReserve(
      KyberReserve.options.address,
      eurToken.address,
      true,
      true,
      true,
    )
    .send({ from: deployer, gas: 8000000 });

  // Melon Fund env
  const KyberAdapterAddress = await deployContract('exchanges/KyberAdapter');
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
    kyberNetworkAddress: KyberNetwork.options.address,
    kyberNetworkProxyAddress: KyberNetworkProxy.options.address,
    KyberAdapterAddress,
  };
};
