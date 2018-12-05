// tslint:disable:max-line-length
import { createQuantity } from '@melonproject/token-math/quantity';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { randomString } from '~/utils/helpers/randomString';
import { createComponents } from '~/contracts/factory/transactions/createComponents';
import { continueCreation } from '~/contracts/factory/transactions/continueCreation';
import { setupFund } from '~/contracts/factory/transactions/setupFund';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';
// tslint:enable:max-line-length

const setupInvestedTestFund = async (
  deployment,
  environment = getGlobalEnvironment(),
) => {
  const fundName = `test-fund-${randomString()}`;

  const { exchangeConfigs, priceSource, tokens, version } = deployment;

  const [weth, mln] = tokens;
  const fees = [];

  await createComponents(
    version,
    {
      defaultTokens: [weth, mln],
      exchangeConfigs,
      fees,
      fundName,
      nativeToken: weth,
      priceSource,
      quoteToken: weth,
    },
    environment,
  );
  await continueCreation(version, undefined, environment);
  const hubAddress = await setupFund(version, undefined, environment);
  const settings = await getSettings(hubAddress, environment);

  await requestInvestment(
    settings.participationAddress,
    {
      investmentAmount: createQuantity(weth, 1),
    },
    environment,
  );
  await executeRequest(settings.participationAddress, undefined, environment);

  return settings;
};

export { setupInvestedTestFund };
