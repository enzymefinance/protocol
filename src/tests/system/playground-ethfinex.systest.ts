import { withNewAccount } from '~/utils/environment/withNewAccount';
import { createQuantity } from '@melonproject/token-math';
import { sendEth } from '~/utils/evm/sendEth';
import { setupInvestedTestFund } from '../utils/setupInvestedTestFund';

import { deposit } from '~/contracts/dependencies/token/transactions/deposit';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { toBeTrueWith } from '../utils/toBeTrueWith';
import { getSystemTestEnvironment } from '../utils/getSystemTestEnvironment';
import { Tracks } from '~/utils/environment/Environment';
import { createOrder } from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { setEthfinexWrapperRegistry } from '~/contracts/version/transactions/setEthfinexWrapperRegistry';
import { getWrapperLock } from '~/contracts/exchanges/third-party/ethfinex/calls/getWrapperLock';
import { isValidSignature } from '~/contracts/exchanges/third-party/0x/calls/isValidSignature';
import { makeEthfinexOrder } from '~/contracts/fund/trading/transactions/makeEthfinexOrder';
import { Exchanges } from '~/Contracts';

expect.extend({ toBeTrueWith });

describe('playground', () => {
  test('Happy path', async () => {
    const master = await getSystemTestEnvironment(Tracks.KYBER_PRICE);

    const manager = await withNewAccount(master);
    const weth = getTokenBySymbol(master, 'WETH');
    const mln = getTokenBySymbol(master, 'MLN');
    const ethfinex =
      manager.deployment.exchangeConfigs[Exchanges.Ethfinex].exchange;
    const wrapperRegistryEFX =
      manager.deployment.thirdPartyContracts.exchanges.ethfinex
        .wrapperRegistryEFX;
    const wethWrapperLock = await getWrapperLock(master, wrapperRegistryEFX, {
      token: weth,
    });

    await sendEth(master, {
      howMuch: createQuantity('ETH', 2),
      to: manager.wallet.address,
    });

    const quantity = createQuantity(weth, 1);

    await deposit(manager, quantity.token.address, undefined, {
      value: quantity.quantity.toString(),
    });

    const routes = await setupInvestedTestFund(manager);

    await setEthfinexWrapperRegistry(
      master,
      manager.deployment.melonContracts.registry,
      {
        address: wrapperRegistryEFX,
      },
    );

    const makerQuantity = createQuantity(wethWrapperLock, 0.05);
    const takerQuantity = createQuantity(mln, 1);

    const unsignedEthfinexOrder = await createOrder(manager, ethfinex, {
      makerAddress: routes.tradingAddress,
      makerQuantity,
      takerQuantity,
    });
    const signedOrder = await signOrder(manager, unsignedEthfinexOrder);

    const isSignatureValidBefore = await isValidSignature(manager, ethfinex, {
      signedOrder,
    });

    const result = await makeEthfinexOrder(manager, routes.tradingAddress, {
      signedOrder,
    });

    const isSignatureValidAfter = await isValidSignature(manager, ethfinex, {
      signedOrder,
    });

    expect(result).toBeTruthy();
    expect(isSignatureValidBefore).toBeFalsy();
    expect(isSignatureValidAfter).toBeTruthy();
  });
});
