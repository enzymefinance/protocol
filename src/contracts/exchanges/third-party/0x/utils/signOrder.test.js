import { Environment } from '~/utils/environment/Environment';
import {
  initTestEnvironment,
  keyPairs,
} from '~/tests/utils/initTestEnvironment';
import { withPrivateKeySigner } from '~/utils/environment/withPrivateKeySigner';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { deploy0xExchange } from '~/contracts/exchanges/transactions/deploy0xExchange';
import { createUnsignedOrder } from './createOrder';
import { signOrder } from './signOrder';
import { isValidSignature } from '../calls/isValidSignature';
import { toWei } from 'web3-utils';

describe('signOrder', () => {
  let shared = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared.withPK = await withPrivateKeySigner(
      shared.env,
      keyPairs.get(shared.env.wallet.address.toLowerCase()),
    );

    shared.weth = await getToken(
      shared.env,
      await deployToken(shared.env, 'WETH'),
    );
    shared.mln = await getToken(
      shared.env,
      await deployToken(shared.env, 'MLN'),
    );
    shared.zrx = await getToken(
      shared.env,
      await deployToken(shared.env, 'ZRX'),
    );

    shared.zeroEx = await deploy0xExchange(shared.env, {
      zrxToken: shared.zrx,
    });
  });

  it('is same signature with both signing strategies', async () => {
    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedOrder(shared.env, shared.zeroEx, {
      makerTokenAddress: shared.mln.address,
      makerAssetAmount,
      takerTokenAddress: shared.weth.address,
      takerAssetAmount,
    });

    const signedDefault = await signOrder(shared.env, unsignedOrder);
    const signedPk = await signOrder(shared.withPK, unsignedOrder);

    expect(
      await isValidSignature(shared.env, shared.zeroEx, {
        signedOrder: signedDefault,
      }),
    ).toBe(true);
    expect(
      await isValidSignature(shared.env, shared.zeroEx, {
        signedOrder: signedPk,
      }),
    ).toBe(true);
  });
});
