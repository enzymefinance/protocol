import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { addTokenPairWhitelist } from '~/contracts/exchanges/transactions/addTokenPairWhitelist';
import { deployMatchingMarket } from '~/contracts/exchanges/transactions/deployMatchingMarket';
import { getContract } from '~/utils/solidity/getContract';
import { deployAndGetContract } from '~/utils/solidity/deployAndGetContract';
import { LogLevels } from './environment/Environment';

/**
 * Deploys a fresh set of (potentially) mocked contracts.
 * Arguments can be overriden to deploy mock or real contracts as needed.
 */
export const deployMockSystem = async ({
  accountingContract = Contracts.MockAccounting,
  engineContract = Contracts.Engine,
  feeManagerContract = Contracts.MockFeeManager,
  hubContract = Contracts.MockHub,
  policyManagerContract = Contracts.PolicyManager,
  participationContract = Contracts.Participation,
  priceSourceContract = Contracts.TestingPriceFeed,
  rankingContract = Contracts.FundRanking,
  registryContract = Contracts.MockRegistry,
  sharesContract = Contracts.MockShares,
  tradingContract = Contracts.Trading,
  vaultContract = Contracts.Vault,
  versionContract = Contracts.MockVersion,
} = {}) => {
  const environment = getGlobalEnvironment();
  const debug = environment.logger('melon:protocol:utils', LogLevels.DEBUG);
  const accounts = await environment.eth.getAccounts();

  debug('Deploying mocks from', accounts[0]);
  const wethTokenAddress = await deployToken('ETH');
  const mlnTokenAddress = await deployToken('MLN');
  const baseTokenAddress = mlnTokenAddress;
  const quoteTokenAddress = wethTokenAddress;
  const quoteToken = await getToken(quoteTokenAddress);
  const baseToken = await getToken(baseTokenAddress);
  const mln = await getContract(
    Contracts.StandardToken,
    mlnTokenAddress,
    environment,
  );
  const weth = await getContract(
    Contracts.StandardToken,
    wethTokenAddress,
    environment,
  );

  const priceSource = await deployAndGetContract(priceSourceContract, [
    quoteToken.address,
    quoteToken.decimals,
  ]);
  const matchingMarketAddress = await deployMatchingMarket();

  await addTokenPairWhitelist(matchingMarketAddress, { baseToken, quoteToken });

  const matchingMarketAdapter = await deployAndGetContract(
    Contracts.MatchingMarketAdapter,
  );

  const version = await deployAndGetContract(versionContract);
  const ranking = await deployAndGetContract(rankingContract);
  const registry = await deployAndGetContract(registryContract);

  const hub = await deployAndGetContract(hubContract);
  await hub.methods
    .setManager(environment.wallet.address)
    .send({ from: environment.wallet.address });
  await hub.methods.setName('Mock').send({ from: environment.wallet.address });

  const accounting = await deployAndGetContract(accountingContract, [
    hub.options.address,
    quoteToken.address,
    wethTokenAddress,
    [quoteToken.address, baseToken.address],
  ]);
  const feeManager = await deployAndGetContract(feeManagerContract, [
    hub.options.address,
  ]);
  const policyManager = await deployAndGetContract(policyManagerContract, [
    hub.options.address,
  ]);
  const participation = await deployAndGetContract(participationContract, [
    hub.options.address,
    [quoteToken.address, baseToken.address],
    registry.options.address,
  ]);
  const shares = await deployAndGetContract(sharesContract, [
    hub.options.address,
  ]);
  const trading = await deployAndGetContract(tradingContract, [
    hub.options.address,
    [matchingMarketAddress],
    [matchingMarketAdapter.options.address],
    [true],
    registry.options.address,
  ]);
  const vault = await deployAndGetContract(vaultContract, [
    hub.options.address,
  ]);

  // TODO: replace with raw function when MockEngine is available
  const engine = await deployAndGetContract(engineContract, [
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
