import {
  createQuantity,
  QuantityInterface,
  subtract,
  valueIn,
  divide,
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
import { FunctionSignatures } from '~/contracts/fund/trading/utils/FunctionSignatures';
import { register } from '~/contracts/fund/policies/transactions/register';
import { getPrice } from '~/contracts/prices/calls/getPrice';

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

    await register(shared.env, shared.routes.policyManagerAddress, {
      method: FunctionSignatures.takeOrder,
      policy: shared.env.deployment.melonContracts.policies.priceTolerance,
    });
  });

  test('Trade on Melon Engine', async () => {
    await increaseTime(shared.env, 86400 * 32);
    await thaw(shared.env, shared.engine);
    const takerQuantity = createQuantity(shared.mln, 0.001); // Mln sell qty
    const mlnPrice = await getPrice(
      shared.env,
      `${shared.env.deployment.melonContracts.priceSource}`,
      shared.mln,
    );
    const makerQuantity = valueIn(mlnPrice, takerQuantity); // Min WETH
    const preliquidEther = await getLiquidEther(shared.env, shared.engine);

    await transfer(shared.env, {
      howMuch: takerQuantity,
      to: shared.routes.vaultAddress,
    });

    const preFundWeth: QuantityInterface = await balanceOf(
      shared.env,
      shared.weth.address,
      {
        address: shared.routes.vaultAddress,
      },
    );
    const preFundMln: QuantityInterface = await balanceOf(
      shared.env,
      shared.mln.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

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
    const postFundMln: QuantityInterface = await balanceOf(
      shared.env,
      shared.mln.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    expect(subtract(postFundWeth.quantity, preFundWeth.quantity)).toEqual(
      subtract(preliquidEther.quantity, postliquidEther.quantity),
    );
    expect(subtract(preFundMln, postFundMln).quantity).toEqual(
      takerQuantity.quantity,
    );
  });

  test('Maker quantity as minimum returned WETH is respected', async () => {
    const takerQuantity = createQuantity(shared.mln, 0.001); // Mln sell qty
    const mlnPrice = await getPrice(
      shared.env,
      `${shared.env.deployment.melonContracts.priceSource}`,
      shared.mln,
    );
    const makerQuantity = createQuantity(
      shared.weth,
      divide(mlnPrice.quote.quantity, 2),
    ); // Min WETH

    await transfer(shared.env, {
      howMuch: takerQuantity,
      to: shared.routes.vaultAddress,
    });

    await expect(
      takeEngineOrder(shared.env, shared.routes.tradingAddress, {
        makerQuantity,
        takerQuantity,
      }),
    ).rejects.toThrow();
  });
});
