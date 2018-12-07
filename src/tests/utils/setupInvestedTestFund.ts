import { createQuantity } from '@melonproject/token-math/quantity';
import { randomString } from '~/utils/helpers/randomString';
import { createComponents } from '~/contracts/factory/transactions/createComponents';
import { continueCreation } from '~/contracts/factory/transactions/continueCreation';
import { setupFund } from '~/contracts/factory/transactions/setupFund';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';
import { Environment } from '~/utils/environment/Environment';

const setupInvestedTestFund = async (environment: Environment, deployment) => {
  const fundName = `test-fund-${randomString()}`;

  const { exchangeConfigs, priceSource, tokens, version } = deployment;

  const [weth, mln] = tokens;
  const fees = [];

  await createComponents(environment, version, {
    defaultTokens: [weth, mln],
    exchangeConfigs,
    fees,
    fundName,
    nativeToken: weth,
    priceSource,
    quoteToken: weth,
  });
  await continueCreation(environment, version);
  const hubAddress = await setupFund(environment, version);
  const settings = await getSettings(environment, hubAddress);

  const investmentAmount = createQuantity(weth, 1);

  await approve(environment, {
    howMuch: investmentAmount,
    spender: settings.participationAddress,
  });

  await requestInvestment(environment, settings.participationAddress, {
    investmentAmount,
  });

  await executeRequest(environment, settings.participationAddress);

  return settings;
};

export { setupInvestedTestFund };
