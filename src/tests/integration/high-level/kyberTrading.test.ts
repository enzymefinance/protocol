import {
  createQuantity,
  QuantityInterface,
  greaterThan,
  subtract,
  valueIn,
} from '@melonproject/token-math';
import { Environment, Tracks } from '~/utils/environment/Environment';
import { deployAndInitTestEnv } from '../../utils/deployAndInitTestEnv';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { getExpectedRate } from '~/contracts/exchanges/third-party/kyber/calls/getExpectedRate';
import { Exchanges } from '~/Contracts';
import { takeOrderOnKyber } from '~/contracts/fund/trading/transactions/takeOrderOnKyber';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';

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
  });

  test('Happy path', async () => {
    const weth = getTokenBySymbol(shared.env, 'WETH');
    const mln = getTokenBySymbol(shared.env, 'MLN');
    const takerQuantity = createQuantity(weth, 1);
    const expectedRate = await getExpectedRate(
      shared.env,
      shared.kyber,
      weth,
      mln,
      weth,
      takerQuantity,
    );
    // Minimum quantity of dest asset expected to get in return in the trade
    const minMakerQuantity = valueIn(expectedRate, takerQuantity);

    const preMlnBalance: QuantityInterface = await balanceOf(
      shared.env,
      mln.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    await takeOrderOnKyber(shared.env, shared.routes.tradingAddress, {
      makerQuantity: minMakerQuantity,
      takerQuantity,
    });

    const postMlnBalance: QuantityInterface = await balanceOf(
      shared.env,
      mln.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    expect(
      greaterThan(subtract(postMlnBalance, preMlnBalance), minMakerQuantity),
    ).toBeTruthy();
  });
});
