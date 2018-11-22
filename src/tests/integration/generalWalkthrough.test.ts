import 'babel-polyfill';
import { getPrice } from '@melonproject/token-math/price';
import { createQuantity, isEqual } from '@melonproject/token-math/quantity';

import { initTestEnvironment } from '~/utils/environment';
import { deploySystem, Address } from '~/utils';
import {
  createComponents,
  continueCreation,
  setupFund,
} from '~/contracts/factory';
import { getSettings, componentsFromSettings } from '~/contracts/fund/hub';
import { register, PolicedMethods } from '~/contracts/fund/policies';
import { update } from '~/contracts/prices';
import {
  requestInvestment,
  executeRequest,
} from '~/contracts/fund/participation';
import { setIsFund, setAmguPrice } from '~/contracts/version';
import { shutDownFund } from '~/contracts/fund/hub/transactions/shutDownFund';
import { getAmguToken } from '~/contracts/engine/calls/getAmguToken';
import { redeem } from '~/contracts/fund/participation/transactions/redeem';
// tslint:disable-next-line:max-line-length
import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';

const shared: any = {};

beforeAll(async () => {
  shared.environment = await initTestEnvironment();
  shared.accounts = await shared.environment.eth.getAccounts();
});

const randomString = (length = 4) =>
  Math.random()
    .toString(36)
    .substr(2, length);

test(
  'Happy path',
  async () => {
    const fundName = `test-fund-${randomString()}`;
    const deployment = await deploySystem();
    const {
      exchangeConfigs,
      fundFactory,
      priceSource,
      tokens,
      policies,
      version,
    } = deployment;
    const [quoteToken, baseToken] = tokens;

    const defaultTokens = [quoteToken, baseToken];

    const amguToken = await getAmguToken(fundFactory);
    const amguPrice = createQuantity(amguToken, '1000000000');
    await setAmguPrice(version, amguPrice);

    await createComponents(fundFactory, {
      defaultTokens,
      exchangeConfigs,
      fundName,
      priceSource,
      quoteToken,
    });

    await continueCreation(fundFactory);
    const hubAddress = await setupFund(fundFactory);

    const settings = await getSettings(hubAddress);

    await register(settings.policyManagerAddress, {
      method: PolicedMethods.makeOrder,
      policy: policies.priceTolerance,
    });
    await register(settings.policyManagerAddress, {
      method: PolicedMethods.takeOrder,
      policy: policies.priceTolerance,
    });
    await register(settings.policyManagerAddress, {
      method: PolicedMethods.executeRequest,
      policy: policies.whitelist,
    });

    const newPrice = getPrice(
      createQuantity(baseToken, '1'),
      createQuantity(quoteToken, '2'),
    );

    await update(priceSource, [newPrice]);

    const components = componentsFromSettings(settings);

    await Promise.all(
      Object.values(components).map((address: Address) =>
        setIsFund(version, { address }),
      ),
    );

    const request = await requestInvestment(settings.participationAddress, {
      investmentAmount: createQuantity(quoteToken, 1),
    });

    const executedRequest = await executeRequest(settings.participationAddress);

    expect(
      isEqual(request.requestedShares, executedRequest.shareQuantity),
    ).toBe(true);

    const redemption = await redeem(settings.participationAddress);
    console.log(redemption);

    const holdings = await getFundHoldings(settings.accountingAddress);
    console.log(holdings);

    const shutDown = await shutDownFund(hubAddress);

    expect(shutDown).toBe(true);

    await expect(
      requestInvestment(settings.participationAddress, {
        investmentAmount: createQuantity(quoteToken, 1),
      }),
    ).rejects.toThrow(`Fund with hub address: ${hubAddress} is shut down`);
  },
  30 * 1000,
);
