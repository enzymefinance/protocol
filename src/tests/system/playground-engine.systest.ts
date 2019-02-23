import { withNewAccount } from '~/utils/environment/withNewAccount';
import {
  createQuantity,
  QuantityInterface,
  subtract,
} from '@melonproject/token-math';

import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { setAmguPrice } from '~/contracts/engine/transactions/setAmguPrice';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';
import { sendEth } from '~/utils/evm/sendEth';
import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { thaw } from '~/contracts/engine/transactions/thaw';
import { transfer } from '~/contracts/dependencies/token/transactions/transfer';
import { takeEngineOrder } from '~/contracts/fund/trading/transactions/takeEngineOrder';
import { getLiquidEther } from '~/contracts/engine/calls/getLiquidEther';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';

expect.extend({ toBeTrueWith });

describe('playground', () => {
  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);
    const manager = await withNewAccount(master);
    const weth = getTokenBySymbol(master, 'WETH');
    const mln = getTokenBySymbol(master, 'MLN');
    const engine = manager.deployment.melonContracts.engine;

    const amguPrice = createQuantity('MLN', '10000000000');
    await setAmguPrice(
      master,
      master.deployment.melonContracts.engine,
      amguPrice,
    );

    await sendEth(master, {
      howMuch: createQuantity('ETH', 2),
      to: manager.wallet.address,
    });

    const quantity = createQuantity(weth, 1);

    await deposit(manager, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const routes = await setupInvestedTestFund(manager);

    await thaw(manager, engine);
    const takerQuantity = createQuantity(mln, 0.001); // Mln sell qty
    // const mlnPrice = await getPrice(
    //   manager,
    //   `${manager.deployment.melonContracts.priceSource}`,
    //   mln,
    // );
    const makerQuantity = createQuantity(weth, 0.00001); // Min WETH
    const preliquidEther = await getLiquidEther(manager, engine);

    await transfer(master, {
      howMuch: takerQuantity,
      to: routes.vaultAddress,
    });

    const preFundWeth: QuantityInterface = await balanceOf(
      manager,
      weth.address,
      {
        address: routes.vaultAddress,
      },
    );
    const preFundMln: QuantityInterface = await balanceOf(
      manager,
      mln.address,
      {
        address: routes.vaultAddress,
      },
    );

    await takeEngineOrder(manager, routes.tradingAddress, {
      makerQuantity,
      takerQuantity,
    });

    const postliquidEther = await getLiquidEther(manager, engine);
    const postFundWeth: QuantityInterface = await balanceOf(
      manager,
      weth.address,
      {
        address: routes.vaultAddress,
      },
    );
    const postFundMln: QuantityInterface = await balanceOf(
      manager,
      mln.address,
      {
        address: routes.vaultAddress,
      },
    );

    expect(subtract(postFundWeth.quantity, preFundWeth.quantity)).toEqual(
      subtract(preliquidEther.quantity, postliquidEther.quantity),
    );
    expect(subtract(preFundMln, postFundMln).quantity).toEqual(
      takerQuantity.quantity,
    );
  });
});
