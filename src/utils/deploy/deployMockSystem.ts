import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
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

  const matchingMarketAdapter = await deployAndGetContract(
    environment,
    Contracts.MatchingMarketAdapter,
  );

  debug('Adapter', matchingMarketAdapter.options.address);

  const version = await deployAndGetContract(environment, versionContract);
  const registry = await deployAndGetContract(environment, registryContract);
  const ranking = await deployAndGetContract(environment, rankingContract);

  const hub = await deployAndGetContract(environment, hubContract);
  await hub.methods
    .setManager(environment.wallet.address.toString())
    .send({ from: environment.wallet.address.toString() });
  await hub.methods.setName('Mock').send({ from: environment.wallet.address });

  const accounting = await deployAndGetContract(
    environment,
    accountingContract,
    [
      hub.options.address.toString(),
      quoteToken.address.toString(),
      wethTokenAddress.toString(),
      [quoteToken.address.toString(), baseToken.address.toString()],
    ],
  );

  const feeManager = await deployAndGetContract(
    environment,
    feeManagerContract,
    [hub.options.address.toString(), fees],
  );

  const policyManager = await deployAndGetContract(
    environment,
    policyManagerContract,
    [hub.options.address.toString()],
  );

  const participation = await deployAndGetContract(
    environment,
    participationContract,
    [
      hub.options.address.toString(),
      [quoteToken.address.toString(), baseToken.address.toString()],
      registry.options.address.toString(),
    ],
  );

  const shares = await deployAndGetContract(environment, sharesContract, [
    hub.options.address.toString(),
  ]);

  const trading = await deployAndGetContract(environment, tradingContract, [
    hub.options.address.toString(),
    [matchingMarketAddress.toString()],
    [matchingMarketAdapter.options.address.toString()],
    [true],
    registry.options.address.toString(),
  ]);

  const vault = await deployAndGetContract(environment, vaultContract, [
    hub.options.address.toString(),
  ]);

  // TODO: replace with raw function when MockEngine is available
  const engine = await deployAndGetContract(environment, engineContract, [
    priceSource.options.address.toString(),
    30 * 24 * 60 * 60, // month
    mlnTokenAddress.toString(),
  ]);

  await engine.methods
    .setVersion(version.options.address.toString())
    .send({ from: environment.wallet.address.toString() });

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
    .send({ from: environment.wallet.address.toString(), gas: 8000000 });

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
      .send({ from: environment.wallet.address.toString(), gas: 8000000 });
  }
  await hub.methods
    .setPermissions()
    .send({ from: environment.wallet.address.toString(), gas: 8000000 });

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
