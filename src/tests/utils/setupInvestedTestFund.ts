import { createQuantity } from '@melonproject/token-math/quantity';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { randomString } from '~/utils/helpers/randomString';
import { createComponents } from '~/contracts/factory/transactions/createComponents';
import { continueCreation } from '~/contracts/factory/transactions/continueCreation';
import { setupFund } from '~/contracts/factory/transactions/setupFund';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { invest } from '~/contracts/fund/participation/transactions/invest';
import { approve } from '~/contracts/dependencies/token/transactions/approve';

const setupInvestedTestFund = async (
  deployment,
  environment = getGlobalEnvironment(),
) => {
  const fundName = `test-fund-${randomString()}`;

  const { exchangeConfigs, priceSource, tokens, version } = deployment;

  const [weth, mln] = tokens;

  await createComponents(
    version,
    {
      defaultTokens: [weth, mln],
      exchangeConfigs,
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

  const investmentAmount = createQuantity(weth, 1);

  await approve({
    howMuch: investmentAmount,
    spender: settings.participationAddress,
  });

  await invest(
    settings.participationAddress,
    {
      investmentAmount,
    },
    environment,
  );

  return settings;
};

export { setupInvestedTestFund };
