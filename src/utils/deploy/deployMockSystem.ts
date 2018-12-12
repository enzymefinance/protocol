import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { addTokenPairWhitelist } from '~/contracts/exchanges/transactions/addTokenPairWhitelist';
import { deployMatchingMarket } from '~/contracts/exchanges/transactions/deployMatchingMarket';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndGetContract } from '~/utils/solidity/deployAndGetContract';
import { LogLevels } from '../environment/Environment';
import { Environment } from '~/utils/environment/Environment';

/**
 * Deploys a fresh set of (potentially) mocked contracts.
 * Arguments can be overriden to deploy mock or real contracts as needed.
 */
export const deployMockSystem = async (
  environment: Environment,
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
  const debug = environment.logger('melon:protocol:utils', LogLevels.DEBUG);
  const accounts = await environment.eth.getAccounts();

  debug('Deploying mocks from', accounts[0]);
  const wethTokenAddress = await deployToken(environment, 'ETH');
  const mlnTokenAddress = await deployToken(environment, 'MLN');
  const baseTokenAddress = mlnTokenAddress;
  const quoteTokenAddress = wethTokenAddress;
  const quoteToken = await getToken(environment, quoteTokenAddress);
  const baseToken = await getToken(environment, baseTokenAddress);
  const mln = await getContract(
    environment,
    Contracts.StandardToken,
    mlnTokenAddress,
  );
  const weth = await getContract(
    environment,
    Contracts.StandardToken,
    wethTokenAddress,
  );

  const priceSource = await deployAndGetContract(
    environment,
    priceSourceContract,
    [quoteToken.address, quoteToken.decimals],
  );

  const matchingMarketAddress = await deployMatchingMarket(environment, {
    tokens: [quoteToken, baseToken],
  });
  await addTokenPairWhitelist(environment, matchingMarketAddress, {
    baseToken,
    quoteToken,
  });

  const matchingMarketAdapter = await deployAndGetContract(
    environment,
    Contracts.MatchingMarketAdapter,
  );

  const version = await deployAndGetContract(environment, versionContract);
  const registry = await deployAndGetContract(environment, registryContract);
  const ranking = await deployAndGetContract(environment, rankingContract);

  const hub = await deployAndGetContract(environment, hubContract);
  await hub.methods
    .setManager(environment.wallet.address)
    .send({ from: environment.wallet.address });
  await hub.methods.setName('Mock').send({ from: environment.wallet.address });

  const accounting = await deployAndGetContract(
    environment,
    accountingContract,
    [
      hub.options.address,
      quoteToken.address,
      wethTokenAddress,
      [quoteToken.address, baseToken.address],
    ],
  );

  const feeManager = await deployAndGetContract(
    environment,
    feeManagerContract,
    [hub.options.address, fees],
  );

  const policyManager = await deployAndGetContract(
    environment,
    policyManagerContract,
    [hub.options.address],
  );

  const participation = await deployAndGetContract(
    environment,
    participationContract,
    [
      hub.options.address,
      [quoteToken.address, baseToken.address],
      registry.options.address,
    ],
  );

  const shares = await deployAndGetContract(environment, sharesContract, [
    hub.options.address,
  ]);

  const trading = await deployAndGetContract(environment, tradingContract, [
    hub.options.address,
    [matchingMarketAddress],
    [matchingMarketAdapter.options.address],
    [true],
    registry.options.address,
  ]);

  const vault = await deployAndGetContract(environment, vaultContract, [
    hub.options.address,
  ]);

  // TODO: replace with raw function when MockEngine is available
  const engine = await deployAndGetContract(environment, engineContract, [
    priceSource.options.address,
    30 * 24 * 60 * 60, // month
    mlnTokenAddress,
  ]);

  await engine.methods
    .setVersion(version.options.address)
    .send({ from: environment.wallet.address });

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
    .send({ from: environment.wallet.address, gas: 8000000 });

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
      .send({ from: environment.wallet.address, gas: 8000000 });
  }
  await hub.methods
    .setPermissions()
    .send({ from: environment.wallet.address, gas: 8000000 });

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
