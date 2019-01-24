import {
  createQuantity,
  QuantityInterface,
  greaterThan,
  subtract,
  valueIn,
  createPrice,
  isEqual,
} from '@melonproject/token-math';
import { Environment, Tracks } from '~/utils/environment/Environment';
import { deployAndInitTestEnv } from '../../utils/deployAndInitTestEnv';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getExpectedRate } from '~/contracts/exchanges/third-party/kyber/calls/getExpectedRate';
import { Exchanges } from '~/Contracts';
import { takeOrderOnKyber } from '~/contracts/fund/trading/transactions/takeOrderOnKyber';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { register } from '~/contracts/fund/policies/transactions/register';
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { getPrice } from '~/contracts/prices/calls/getPrice';
import { setBaseRate } from '~/contracts/exchanges/third-party/kyber/transactions/setBaseRate';
import { toBeTrueWith } from '~/tests/utils/toBeTrueWith';
// import { getFundHoldings } from '~/contracts/fund/accounting/calls/getFundHoldings';

expect.extend({ toBeTrueWith });

describe('Happy Path', () => {
  const shared: {
    env?: Environment;
    [p: string]: any;
  } = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    expect(shared.env.track).toBe(Tracks.TESTING);
    shared.accounts = await shared.env.eth.getAccounts();
    shared.kyber =
      shared.env.deployment.exchangeConfigs[Exchanges.KyberNetwork].exchange;
    shared.routes = await setupInvestedTestFund(shared.env);
    shared.weth = getTokenBySymbol(shared.env, 'WETH');
    shared.mln = getTokenBySymbol(shared.env, 'MLN');
    await register(shared.env, shared.routes.policyManagerAddress, {
      method: FunctionSignatures.takeOrder,
      policy: shared.env.deployment.melonContracts.policies.priceTolerance,
    });

    // Setting rates on kyber reserve
    const mlnPrice = await getPrice(
      shared.env,
      shared.env.deployment.melonContracts.priceSource.toString(),
      shared.mln,
    );
    const ethPriceInMln = createPrice(mlnPrice.quote, mlnPrice.base);

    const prices = [
      {
        buy: ethPriceInMln,
        sell: mlnPrice,
      },
    ];
    await setBaseRate(
      shared.env,
      shared.env.deployment.thirdPartyContracts.exchanges.kyber.conversionRates,
      {
        prices,
      },
    );
  });

  test('Trade on kyber', async () => {
    const takerQuantity = createQuantity(shared.weth, 0.1);
    const expectedRate = await getExpectedRate(shared.env, shared.kyber, {
      fillTakerQuantity: takerQuantity,
      makerAsset: shared.mln,
      takerAsset: shared.weth,
    });
    // Minimum quantity of dest asset expected to get in return in the trade
    const minMakerQuantity = valueIn(expectedRate, takerQuantity);

    // const preHoldings = await getFundHoldings(
    //   shared.env,
    //   shared.routes.accountingAddress,
    // );

    const preMlnBalance: QuantityInterface = await balanceOf(
      shared.env,
      shared.mln.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    const result = await takeOrderOnKyber(
      shared.env,
      shared.routes.tradingAddress,
      {
        makerQuantity: minMakerQuantity,
        takerQuantity,
      },
    );

    const postMlnBalance: QuantityInterface = await balanceOf(
      shared.env,
      shared.mln.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    // const postHoldings = await getFundHoldings(
    // shared.env,
    // shared.routes.accountingAddress,
    // );

    expect(result.takerQuantity).toBeTrueWith(isEqual, takerQuantity);
    expect(result.makerQuantity).toBeTrueWith(greaterThan, minMakerQuantity);

    expect(
      greaterThan(subtract(postMlnBalance, preMlnBalance), minMakerQuantity),
    ).toBeTruthy();
  });

  test('Price tolerance prevents ill priced trade', async () => {
    const takerQuantity = createQuantity(shared.weth, 0.1);
    // Minimum quantity of dest asset expected to get in return in the trade
    const minMakerQuantity = createQuantity(shared.mln, 0);

    await expect(
      takeOrderOnKyber(shared.env, shared.routes.tradingAddress, {
        makerQuantity: minMakerQuantity,
        takerQuantity,
      }),
    ).rejects.toThrow();
  });
});
