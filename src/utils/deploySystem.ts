import { createQuantity } from '@melonproject/token-math/quantity';
import { getPrice } from '@melonproject/token-math/price';

import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';
import { Address } from '~/utils/types';
import { deployAndGetContract } from '~/utils/solidity';

import {
  deploy as deployToken,
  getToken,
  approve,
} from '~/contracts/dependencies/token';
import { deploy as deployPriceFeed, update } from '~/contracts/prices';
import {
  deployMatchingMarket,
  deployMatchingMarketAdapter,
  addTokenPairWhitelist,
} from '~/contracts/exchanges';
// tslint:disable-next-line:max-line-length
import { deploy as deployEngine } from '~/contracts/engine';
import { deploy as deployPriceTolerance } from '~/contracts/fund/risk-management';
import { deployWhitelist } from '~/contracts/fund/compliance';
import { deployAccountingFactory } from '~/contracts/fund/accounting';
import { deployFeeManagerFactory } from '~/contracts/fund/fees';
import { deployParticipationFactory } from '~/contracts/fund/participation';
import { deploySharesFactory } from '~/contracts/fund/shares';
import { deployTradingFactory } from '~/contracts/fund/trading';
import { deployVaultFactory } from '~/contracts/fund/vault';
import {
  deployPolicyManagerFactory,
  register,
  PolicedMethods,
} from '~/contracts/fund/policies';
import {
  deployFundFactory,
  createComponents,
  continueCreation,
  setupFund,
} from '~/contracts/factory';
import { getSettings } from '~/contracts/fund/hub';

/**
 * Deploys all contracts and checks their health
 */
export const deploySystem = async () => {
  const globalEnvironment = getGlobalEnvironment();
  const accounts = await globalEnvironment.eth.getAccounts();
  const fundName = 'Clever Fund Name';
  const quoteTokenAddress = await deployToken('ETH');
  const mlnTokenAddress = await deployToken('MLN');
  const baseTokenAddress = mlnTokenAddress;
  const quoteToken = await getToken(quoteTokenAddress);
  const baseToken = await getToken(baseTokenAddress);
  const priceFeedAddress = await deployPriceFeed(quoteToken);
  const matchingMarketAddress = await deployMatchingMarket();

  await addTokenPairWhitelist(matchingMarketAddress, { baseToken, quoteToken });

  const priceToleranceAddress = await deployPriceTolerance(10);

  const whitelistAddress = await deployWhitelist([
    globalEnvironment.wallet.address,
  ]);

  const mockVersion = await deployAndGetContract('version/MockVersion');

  const matchingMarketAdapterAddress = await deployMatchingMarketAdapter();
  const accountingFactoryAddress = await deployAccountingFactory();
  const feeManagerFactoryAddress = await deployFeeManagerFactory();
  const participationFactoryAddress = await deployParticipationFactory();
  const sharesFactoryAddress = await deploySharesFactory();
  const tradingFactoryAddress = await deployTradingFactory();
  const vaultFactoryAddress = await deployVaultFactory();
  const policyManagerFactoryAddress = await deployPolicyManagerFactory();
  const monthInSeconds = 30 * 24 * 60 * 60;
  const engineAddress = await deployEngine(
    mockVersion.options.address,
    priceFeedAddress,
    monthInSeconds,
    mlnTokenAddress,
  );

  const fundFactoryAddress = await deployFundFactory({
    accountingFactoryAddress,
    engineAddress,
    factoryPriceSourceAddress: priceFeedAddress,
    feeManagerFactoryAddress,
    mlnTokenAddress,
    participationFactoryAddress,
    policyManagerFactoryAddress,
    sharesFactoryAddress,
    tradingFactoryAddress,
    vaultFactoryAddress,
    versionAddress: mockVersion.options.address,
  });

  // From here on it is already integration testing
  await mockVersion.methods
    .setFundFactory(fundFactoryAddress)
    .send({ from: accounts[0] });

  const exchangeConfigs = [
    {
      adapterAddress: matchingMarketAdapterAddress,
      address: matchingMarketAddress,
      takesCustody: false,
    },
  ];

  const defaultTokens = [quoteToken, baseToken];

  const priceSource = priceFeedAddress;

  await createComponents(fundFactoryAddress, {
    defaultTokens,
    exchangeConfigs,
    fundName,
    priceSource,
    quoteToken,
  });
  await continueCreation(fundFactoryAddress);
  const hubAddress = await setupFund(fundFactoryAddress);

  const settings = await getSettings(hubAddress);
  await register(settings.policyManagerAddress, {
    method: PolicedMethods.makeOrder,
    policy: priceToleranceAddress,
  });
  await register(settings.policyManagerAddress, {
    method: PolicedMethods.takeOrder,
    policy: priceToleranceAddress,
  });

  const newPrice = getPrice(
    createQuantity(baseToken, 1),
    createQuantity(quoteToken, 0.34),
  );

  await update(priceFeedAddress, [newPrice]);

  await approve({
    howMuch: createQuantity(baseToken, 1),
    spender: new Address(accounts[1]),
  });
};

if (require.main === module) {
  initTestEnvironment().then(async () => {
    await deploySystem();
    process.exit();
  });
}
