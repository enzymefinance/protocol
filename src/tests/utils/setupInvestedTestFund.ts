import { createQuantity } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';

// tslint:disable:max-line-length
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { randomString } from '~/utils/helpers/randomString';
import { createComponents } from '~/contracts/factory/transactions/createComponents';
import { continueCreation } from '~/contracts/factory/transactions/continueCreation';
import { setupFund } from '~/contracts/factory/transactions/setupFund';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { componentsFromSettings } from '~/contracts/fund/hub/utils/componentsFromSettings';
import { setIsFund } from '~/contracts/version/transactions/setIsFund';
import { requestInvestment } from '~/contracts/fund/participation/transactions/requestInvestment';
import { executeRequest } from '~/contracts/fund/participation/transactions/executeRequest';
import { promisesSerial } from '~/utils/helpers/promisesSerial';
// tslint:enable:max-line-length

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
  const fees = [];

  await createComponents(
    fundFactory,
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
  await continueCreation(fundFactory, undefined, environment);
  const hubAddress = await setupFund(fundFactory, undefined, environment);
  const settings = await getSettings(hubAddress, environment);

  await promisesSerial(
    Object.values(componentsFromSettings(settings)).map(
      (address: Address) => () => setIsFund(version, { address }, environment),
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
