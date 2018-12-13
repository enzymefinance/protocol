import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { addTokenPairWhitelist } from '~/contracts/exchanges/transactions/addTokenPairWhitelist';
import { deployMatchingMarket } from '~/contracts/exchanges/transactions/deployMatchingMarket';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndGetContract } from '~/utils/solidity/deployAndGetContract';
import { LogLevels } from './environment/Environment';
import { Environment } from '~/utils/environment/Environment';

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
  const wethTokenAddress = await deployToken(env, 'ETH');
  const mlnTokenAddress = await deployToken(env, 'MLN');
  const baseTokenAddress = mlnTokenAddress;
  const quoteTokenAddress = wethTokenAddress;
  const quoteToken = await getToken(env, quoteTokenAddress);
  const baseToken = await getToken(env, baseTokenAddress);
  const mln = await getContract(env, Contracts.StandardToken, mlnTokenAddress);
  const weth = await getContract(
    env,
    Contracts.StandardToken,
    wethTokenAddress,
  );

  const priceSource = await deployAndGetContract(env, priceSourceContract, [
    quoteToken.address,
    quoteToken.decimals,
  ]);

  const matchingMarketAddress = await deployMatchingMarket(env);
  await addTokenPairWhitelist(env, matchingMarketAddress, {
    baseToken,
    quoteToken,
  });

  const matchingMarketAdapter = await deployAndGetContract(
    env,
    Contracts.MatchingMarketAdapter,
  );

  const version = await deployAndGetContract(env, versionContract);
  const registry = await deployAndGetContract(env, registryContract);
  await registry.methods
    .setPriceSource(priceSource.options.address)
    .send({ from: accounts[0] });
  await registry.methods
    .setMlnToken(`${mlnTokenAddress}`)
    .send({ from: accounts[0] });

  const ranking = await deployAndGetContract(env, rankingContract);

  const hub = await deployAndGetContract(env, hubContract);
  await hub.methods
    .setManager(env.wallet.address)
    .send({ from: env.wallet.address });
  await hub.methods.setName('Mock').send({ from: env.wallet.address });

  const accounting = await deployAndGetContract(env, accountingContract, [
    hub.options.address,
    quoteToken.address,
    wethTokenAddress,
    [quoteToken.address, baseToken.address],
  ]);

  const feeManager = await deployAndGetContract(env, feeManagerContract, [
    hub.options.address,
    fees,
  ]);

  const policyManager = await deployAndGetContract(env, policyManagerContract, [
    hub.options.address,
  ]);

  const participation = await deployAndGetContract(env, participationContract, [
    hub.options.address,
    [quoteToken.address, baseToken.address],
    registry.options.address,
  ]);

  const shares = await deployAndGetContract(env, sharesContract, [
    hub.options.address,
  ]);

  const trading = await deployAndGetContract(env, tradingContract, [
    hub.options.address,
    [matchingMarketAddress],
    [matchingMarketAdapter.options.address],
    [true],
    registry.options.address,
  ]);

  const vault = await deployAndGetContract(env, vaultContract, [
    hub.options.address,
  ]);

  // TODO: replace with raw function when MockEngine is available
  const engine = await deployAndGetContract(env, engineContract, [
    30 * 24 * 60 * 60, // month
  ]);
  await registry.methods
    .setEngine(engine.options.address)
    .send({ from: accounts[0] });
  await engine.methods
    .setRegistry(registry.options.address)
    .send({ from: accounts[0], gas: 8000000 });

  await hub.methods
    .setSpokes([
      accounting.options.address,
      feeManager.options.address,
      participation.options.address,
      policyManager.options.address,
      shares.options.address,
      trading.options.address,
      vault.options.address,
      priceSource.options.address,
      registry.options.address,
      version.options.address,
      engine.options.address,
      mlnTokenAddress,
    ])
    .send({ from: env.wallet.address, gas: 8000000 });

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
      .initializeSpoke(contract.options.address)
      .send({ from: env.wallet.address, gas: 8000000 });
  }
  await hub.methods
    .setPermissions()
    .send({ from: env.wallet.address, gas: 8000000 });

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
