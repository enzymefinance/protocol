import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import {
  deployWeth,
  deployToken,
} from '~/contracts/dependencies/token/transactions/deploy';
import { deployMatchingMarket } from '~/contracts/exchanges/transactions/deployMatchingMarket';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndGetContract } from '~/utils/solidity/deployAndGetContract';
import { LogLevels } from '../environment/Environment';
import { Environment } from '~/utils/environment/Environment';
import { BigInteger, power } from '@melonproject/token-math';

/**
 * Deploys a fresh set of (potentially) mocked contracts.
 * Arguments can be overriden to deploy mock or real contracts as needed.
 */
export const deployMockSystem = async (
  env: Environment,
  {
    accountingContract = Contracts.MockAccounting,
    engineContract = Contracts.Engine,
    feeManagerContract = Contracts.MockFeeManager,
    fees = [],
    hubContract = Contracts.MockHub,
    policyManagerContract = Contracts.PolicyManager,
    participationContract = Contracts.Participation,
    priceSourceContract = Contracts.TestingPriceFeed,
    registryContract = Contracts.MockRegistry,
    sharesContract = Contracts.MockShares,
    tradingContract = Contracts.Trading,
    vaultContract = Contracts.Vault,
    versionContract = Contracts.MockVersion,
    rankingContract = Contracts.FundRanking,
  } = {},
) => {
  const debug = env.logger('melon:protocol:utils', LogLevels.DEBUG);
  const accounts = await env.eth.getAccounts();

  debug('Deploying mocks from', accounts[0]);
  const wethTokenAddress = await deployWeth(env);
  const mlnTokenAddress = await deployToken(env, 'MLN');
  const baseTokenAddress = mlnTokenAddress;
  const quoteTokenAddress = wethTokenAddress;
  const quoteToken = await getToken(env, quoteTokenAddress);
  const baseToken = await getToken(env, baseTokenAddress);
  const mln = await getContract(env, Contracts.StandardToken, mlnTokenAddress);
  const weth = await getContract(env, Contracts.Weth, wethTokenAddress);

  // Deposit Ether to get WETH Tokens
  const depositAmount = power(new BigInteger(10), new BigInteger(24));
  await weth.methods
    .deposit()
    .send({ from: env.wallet.address, value: `${depositAmount}` });

  const priceSource = await deployAndGetContract(env, priceSourceContract, [
    quoteToken.address.toString(),
    quoteToken.decimals,
  ]);

  const matchingMarketAddress = await deployMatchingMarket(env, {
    tokens: [quoteToken, baseToken],
  });

  const matchingMarketAdapter = await deployAndGetContract(
    env,
    Contracts.MatchingMarketAdapter,
  );

  const version = await deployAndGetContract(env, versionContract);
  const registry = await deployAndGetContract(env, registryContract);
  await registry.methods
    .setPriceSource(priceSource.options.address.toString())
    .send({ from: accounts[0] });
  await registry.methods
    .setMlnToken(`${mlnTokenAddress}`)
    .send({ from: accounts[0] });
  await registry.methods
    .setNativeAsset(`${wethTokenAddress}`)
    .send({ from: accounts[0] });
  await registry.methods
    .registerExchangeAdapter(
      matchingMarketAddress.toString(),
      matchingMarketAdapter.options.address.toString(),
    )
    .send({ from: accounts[0] });

  const ranking = await deployAndGetContract(env, rankingContract);

  const hub = await deployAndGetContract(env, hubContract);
  await hub.methods
    .setManager(env.wallet.address.toString())
    .send({ from: env.wallet.address.toString() });
  await hub.methods
    .setName('Mock')
    .send({ from: env.wallet.address.toString() });

  const accounting = await deployAndGetContract(env, accountingContract, [
    hub.options.address.toString(),
    quoteToken.address.toString(),
    wethTokenAddress.toString(),
    [quoteToken.address.toString(), baseToken.address.toString()],
  ]);

  const feeManager = await deployAndGetContract(env, feeManagerContract, [
    hub.options.address.toString(),
    quoteToken.address.toString(),
    fees.map(f => f.feeAddress.toString()),
    fees.map(f => f.feePeriod),
    fees.map(f => f.feeRate),
  ]);

  const policyManager = await deployAndGetContract(env, policyManagerContract, [
    hub.options.address.toString(),
  ]);

  const participation = await deployAndGetContract(env, participationContract, [
    hub.options.address.toString(),
    [quoteToken.address.toString(), baseToken.address.toString()],
    registry.options.address.toString(),
  ]);

  const shares = await deployAndGetContract(env, sharesContract, [
    hub.options.address.toString(),
  ]);

  const trading = await deployAndGetContract(env, tradingContract, [
    hub.options.address.toString(),
    [matchingMarketAddress.toString()],
    [matchingMarketAdapter.options.address.toString()],
    [true],
    registry.options.address.toString(),
  ]);

  const vault = await deployAndGetContract(env, vaultContract, [
    hub.options.address.toString(),
  ]);

  // TODO: replace with raw function when MockEngine is available
  const engine = await deployAndGetContract(env, engineContract, [
    30 * 24 * 60 * 60, // month
  ]);
  await registry.methods
    .setEngine(engine.options.address.toString())
    .send({ from: accounts[0] });
  await engine.methods
    .setRegistry(registry.options.address.toString())
    .send({ from: accounts[0], gas: 8000000 });

  await hub.methods
    .setSpokes([
      accounting.options.address.toString(),
      feeManager.options.address.toString(),
      participation.options.address.toString(),
      policyManager.options.address.toString(),
      shares.options.address.toString(),
      trading.options.address.toString(),
      vault.options.address.toString(),
      priceSource.options.address.toString(),
      registry.options.address.toString(),
      version.options.address.toString(),
      engine.options.address.toString(),
      mlnTokenAddress.toString(),
    ])
    .send({ from: env.wallet.address.toString(), gas: 8000000 });

  const toInit = [
    accounting,
    participation,
    shares,
    trading,
    vault,
    feeManager,
  ];
  for (const contract of toInit) {
    await hub.methods
      .initializeSpoke(contract.options.address.toString())
      .send({ from: env.wallet.address.toString(), gas: 8000000 });
  }
  await hub.methods
    .setPermissions()
    .send({ from: env.wallet.address.toString(), gas: 8000000 });

  const contracts = {
    accounting,
    engine,
    feeManager,
    hub,
    mln,
    participation,
    policyManager,
    priceSource,
    ranking,
    registry,
    shares,
    trading,
    vault,
    version,
    weth,
  };

  return contracts;
};
