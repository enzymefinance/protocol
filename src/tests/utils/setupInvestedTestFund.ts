import * as R from 'ramda';

import { createQuantity, appendDecimals, toBI } from '@melonproject/token-math';
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
import { getToken } from '~/contracts/dependencies/token/calls/getToken';

const DAY_IN_SECONDS = 60 * 60 * 24;

const setupInvestedTestFund = async (environment: Environment) => {
  const fundName = `test-fund-${randomString()}`;

  const debug = environment.logger(
    'melon:protocol:tests:setupInvestedTestFund',
    LogLevels.DEBUG,
  );

  debug('Setting up testfund', fundName);

  const { exchangeConfigs, melonContracts } = environment.deployment;

  const weth = getTokenBySymbol(environment, 'WETH');
  const mln = getTokenBySymbol(environment, 'MLN');
  const fees = [
    {
      feeAddress: melonContracts.fees.managementFee.toLowerCase(),
      feePeriod: toBI(0),
      feeRate: appendDecimals(weth, 0.02),
    },
    {
      feeAddress: melonContracts.fees.performanceFee.toLowerCase(),
      feePeriod: toBI(DAY_IN_SECONDS * 90),
      feeRate: appendDecimals(weth, 0.2),
    },
  ];

  await beginSetup(environment, melonContracts.version, {
    defaultTokens: [weth, mln],
    exchangeConfigs,
    fees,
    fundName,
    nativeToken: weth,
    quoteToken: weth,
  });
  await createAccounting(environment, melonContracts.version);
  await createFeeManager(environment, melonContracts.version);
  await createParticipation(environment, melonContracts.version);
  await createPolicyManager(environment, melonContracts.version);
  await createShares(environment, melonContracts.version);
  await createTrading(environment, melonContracts.version);
  await createVault(environment, melonContracts.version);
  const hubAddress = await completeSetup(environment, melonContracts.version);
  const routes = await getRoutes(environment, hubAddress);
  const fundToken = await getToken(environment, routes.sharesAddress);

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
    requestedShares: createQuantity(fundToken, 1),
  });

  await executeRequest(environment, routes.participationAddress);

  debug('Testfund setup and invested', fundName, routes);

  return { ...routes, hubAddress };
};

export { setupInvestedTestFund };
