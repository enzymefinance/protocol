import {
  createQuantity,
  QuantityInterface,
  subtract,
} from '@melonproject/token-math';
import { Environment, Tracks } from '~/utils/environment/Environment';
import { deployAndInitTestEnv } from '../../utils/deployAndInitTestEnv';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { toBeTrueWith } from '~/tests/utils/toBeTrueWith';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { thaw } from '~/contracts/engine/transactions/thaw';
import { increaseTime } from '~/utils/evm/increaseTime';
import { takeEngineOrder } from '~/contracts/fund/trading/transactions/takeEngineOrder';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { getLiquidEther } from '~/contracts/engine/calls/getLiquidEther';

expect.extend({ toBeTrueWith });

describe('Happy Path', () => {
  const shared: {
    env?: Environment;
    [p: string]: any;
  } = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    expect(shared.env.track).toBe(Tracks.TESTING);

    const amguPrice = createQuantity('MLN', '1000000000000');
    await setAmguPrice(
      shared.env,
      shared.env.deployment.melonContracts.engine,
      amguPrice,
    );
    shared.accounts = await shared.env.eth.getAccounts();
    shared.engine = shared.env.deployment.melonContracts.engine;
    shared.routes = await setupInvestedTestFund(shared.env);
    shared.weth = getTokenBySymbol(shared.env, 'WETH');
    shared.mln = getTokenBySymbol(shared.env, 'MLN');
  });

  test('Trade on Melon Engine', async () => {
    await increaseTime(shared.env, 86400 * 32);
    await thaw(shared.env, shared.engine);
    const makerQuantity = createQuantity(shared.mln, 0.00001);
    const takerQuantity = createQuantity(shared.weth, 0.00001);
    const preliquidEther = await getLiquidEther(shared.env, shared.engine);
    const preFundWeth: QuantityInterface = await balanceOf(
      shared.env,
      shared.weth.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    await transfer(shared.env, {
      howMuch: makerQuantity,
      to: shared.routes.vaultAddress,
    });
    await takeEngineOrder(shared.env, shared.routes.tradingAddress, {
      makerQuantity,
      takerQuantity,
    });

    const postliquidEther = await getLiquidEther(shared.env, shared.engine);
    const postFundWeth: QuantityInterface = await balanceOf(
      shared.env,
      shared.weth.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    expect(subtract(postFundWeth.quantity, preFundWeth.quantity)).toEqual(
      subtract(preliquidEther.quantity, postliquidEther.quantity),
    );
  });
});
