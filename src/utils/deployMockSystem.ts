import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { Contracts } from '~/Contracts';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { addTokenPairWhitelist } from '~/contracts/exchanges/transactions/addTokenPairWhitelist';
import { deployMatchingMarket } from '~/contracts/exchanges/transactions/deployMatchingMarket';
import { getContract } from '~/utils/solidity/getContract';
import { deploy as deployContract } from '~/utils/solidity/deploy';

const debug = require('debug')('melon:protocol:utils');

const deployAndGet = async (contract: Contracts, args = []) =>
  await getContract(contract, await deployContract(`${contract}.sol`, args));

/**
 * Deploys a fresh set of (potentially) mocked contracts.
 * Arguments can be overriden to deploy mock or real contracts as needed.
 */
export const deployMockSystem = async (
  accountingContract = Contracts.Accounting,
  engineContract = Contracts.Engine,
  feeManagerContract = Contracts.MockFeeManager,
  hubContract = Contracts.MockHub,
  policyManagerContract = Contracts.PolicyManager,
  participationContract = Contracts.Participation,
  priceSourceContract = Contracts.TestingPriceFeed,
  sharesContract = Contracts.MockShares,
  tradingContract = Contracts.Trading,
  vaultContract = Contracts.Vault,
  versionContract = Contracts.MockVersion,
) => {
  const environment = getGlobalEnvironment();
  const accounts = await environment.eth.getAccounts();

  debug('Deploying mocks from', accounts[0]);
  const wethTokenAddress = await deployToken('ETH');
  const mlnTokenAddress = await deployToken('MLN');
  const baseTokenAddress = mlnTokenAddress;
  const quoteTokenAddress = wethTokenAddress;
  const quoteToken = await getToken(quoteTokenAddress);
  const baseToken = await getToken(baseTokenAddress);
  const mln = await getContract(Contracts.StandardToken, mlnTokenAddress);
  const weth = await getContract(Contracts.StandardToken, wethTokenAddress);

  const priceSource = await deployAndGet(priceSourceContract, [
    quoteToken.address,
    quoteToken.decimals,
  ]);
  const matchingMarketAddress = await deployMatchingMarket();

  await addTokenPairWhitelist(matchingMarketAddress, { baseToken, quoteToken });

  const matchingMarketAdapter = await deployAndGet(
    Contracts.MatchingMarketAdapter,
  );

  const version = await deployAndGet(versionContract);

  const hub = await deployAndGet(hubContract);
  await hub.methods
    .setManager(environment.wallet.address)
    .send({ from: environment.wallet.address });
  await hub.methods.setName('Mock').send({ from: environment.wallet.address });

  const accounting = await deployAndGet(accountingContract, [
    hub.options.address,
    quoteToken.address,
    [quoteToken.address, baseToken.address],
  ]);
  const feeManager = await deployAndGet(feeManagerContract, [
    hub.options.address,
  ]);
  const policyManager = await deployAndGet(policyManagerContract, [
    hub.options.address,
  ]);
  const participation = await deployAndGet(participationContract, [
    hub.options.address,
    [quoteToken.address, baseToken.address],
  ]);
  const shares = await deployAndGet(sharesContract, [hub.options.address]);
  const trading = await deployAndGet(tradingContract, [
    hub.options.address,
    [matchingMarketAddress],
    [matchingMarketAdapter.options.address],
    [true],
  ]);
  const vault = await deployAndGet(vaultContract, [hub.options.address]);

  // TODO: replace with raw function when MockEngine is available
  const engine = await deployAndGet(engineContract, [
    version.options.address,
    priceSource.options.address,
    30 * 24 * 60 * 60, // month
    mlnTokenAddress,
  ]);

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
      priceSource.options.address, // registrar
      version.options.address,
      engine.options.address,
      mlnTokenAddress,
    ])
    .send({ from: environment.wallet.address, gas: 8000000 });

  const toInit = [accounting, participation, shares, trading, vault];
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
    shares,
    trading,
    vault,
    version,
    weth,
  };

  return contracts;
};
