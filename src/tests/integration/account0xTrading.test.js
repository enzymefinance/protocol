import { AssetProxyId } from '@0x/types';
import { toWei } from 'web3-utils';

import { fetchContract } from '~/../deploy/utils/deploy-contract';
import web3 from '~/../deploy/utils/get-web3';
import { partialRedeploy } from '~/../deploy/scripts/deploy-system';

import { CONTRACT_NAMES } from '~/tests/utils/new/constants';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/new/zeroEx';

describe('account-0x-trading', () => {
  let user, defaultTxOpts, takerEnvironment;
  let accounts;
  let weth, mln, zrx;
  let zeroExExchange, erc20Proxy;
  let deployOut;

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    const [deployer, taker] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    user = deployer;
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;
    deployOut = deployed.deployOut;

    weth = contracts.WETH;
    mln = contracts.MLN;
    zrx = contracts.ZRX;
    zeroExExchange = contracts.Exchange;
    erc20Proxy = contracts.ERC20Proxy;

    await weth.methods
      .transfer(taker, toWei('100', 'Ether'))
      .send(defaultTxOpts);
  });

  // TODO: fix problem with ecSignOrderAsync error for this to pass
  it('Happy path', async () => {
    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      zeroExExchange.options.address,
      {
        makerAddress: user,
        makerTokenAddress: mln.options.address,
        makerAssetAmount,
        takerTokenAddress: weth.options.address,
        takerAssetAmount,
      }
    );

    await mln.methods
      .approve(erc20Proxy.options.address, makerAssetAmount)
      .send(defaultTxOpts);

    const signedOrder = await signZeroExOrder(unsignedOrder, user);
    expect(signedOrder.exchangeAddress).toBe(
      zeroExExchange.options.address.toLowerCase(),
    );
    expect(signedOrder.makerAddress).toBe(user.toLowerCase());
    expect(signedOrder.makerAssetAmount).toBe(makerAssetAmount);

    const result = zeroExExchange.methods
      .fillOrder(
        unsignedOrder,
        takerAssetAmount,
        signedOrder.signature,
      ).send(defaultTxOpts);

    expect(result).toBeTruthy();
  });
});
