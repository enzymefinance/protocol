import * as R from 'ramda';

import { createQuantity } from '@melonproject/token-math';
import { randomString } from '~/utils/helpers/randomString';
import { beginSetup } from '~/contracts/factory/transactions/beginSetup';
import { completeSetup } from '~/contracts/factory/transactions/completeSetup';
import { createAccounting } from '~/contracts/factory/transactions/createAccounting';
import { createFeeManager } from '~/contracts/factory/transactions/createFeeManager';
import { createParticipation } from '~/contracts/factory/transactions/createParticipation';
import { createPolicyManager } from '~/contracts/factory/transactions/createPolicyManager';
import { createShares } from '~/contracts/factory/transactions/createShares';
import { createTrading } from '~/contracts/factory/transactions/createTrading';
import { createVault } from '~/contracts/factory/transactions/createVault';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';
import { Environment, LogLevels } from '~/utils/environment/Environment';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';

const setupInvestedTestFund = async (environment: Environment) => {
  const fundName = `test-fund-${randomString()}`;

  const debug = environment.logger(
    'melon:protocol:tests:setupInvestedTestFund',
    LogLevels.DEBUG,
  );

  debug('Setting up testfund', fundName);

  const {
    exchangeConfigs,
    melonContracts: { version, priceSource },
  } = environment.deployment;

  const weth = getTokenBySymbol(environment, 'WETH');
  const mln = getTokenBySymbol(environment, 'MLN');
  const fees = [];

  await beginSetup(environment, version, {
    defaultTokens: [weth, mln],
    exchangeConfigs,
    fees,
    fundName,
    nativeToken: weth,
    priceSource,
    quoteToken: weth,
  });
  await createAccounting(environment, version);
  await createFeeManager(environment, version);
  await createParticipation(environment, version);
  await createPolicyManager(environment, version);
  await createShares(environment, version);
  await createTrading(environment, version);
  await createVault(environment, version);
  const hubAddress = await completeSetup(environment, version);
  const routes = await getRoutes(environment, hubAddress);

  expect(R.keys(routes)).toEqual(
    expect.arrayContaining([
      'accountingAddress',
      'feeManagerAddress',
      'participationAddress',
      'policyManagerAddress',
      'priceSourceAddress',
      'registryAddress',
      'sharesAddress',
      'tradingAddress',
      'vaultAddress',
      'versionAddress',
    ]),
  );

  const investmentAmount = createQuantity(weth, 1);

  await approve(environment, {
    howMuch: investmentAmount,
    spender: routes.participationAddress,
  });

  await requestInvestment(environment, routes.participationAddress, {
    investmentAmount,
  });

  await executeRequest(environment, routes.participationAddress);

  debug('Testfund setup and invested', fundName, routes);

  return { ...routes, hubAddress };
};

export { setupInvestedTestFund };
