import { randomString } from '~/utils/helpers';
import { getGlobalEnvironment } from '~/utils/environment';
import {
  createComponents,
  continueCreation,
  setupFund,
} from '~/contracts/factory';
import { getSettings, componentsFromSettings } from '~/contracts/fund/hub';
import { setIsFund } from '~/contracts/version';
import {
  requestInvestment,
  executeRequest,
} from '~/contracts/fund/participation';
import { createQuantity } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

const setupInvestedTestFund = async (
  deployment,
  environment = getGlobalEnvironment(),
) => {
  const fundName = `test-fund-${randomString()}`;

  const {
    exchangeConfigs,
    fundFactory,
    priceSource,
    tokens,
    version,
  } = deployment;

  const [weth, mln] = tokens;

  await createComponents(
    fundFactory,
    {
      defaultTokens: [weth, mln],
      exchangeConfigs,
      fundName,
      priceSource,
      quoteToken: weth,
    },
    environment,
  );
  await continueCreation(fundFactory, undefined, environment);
  const hubAddress = await setupFund(fundFactory, undefined, environment);
  const settings = await getSettings(hubAddress, environment);

  await Promise.all(
    Object.values(componentsFromSettings(settings)).map((address: Address) =>
      setIsFund(version, { address }, environment),
    ),
  );

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
