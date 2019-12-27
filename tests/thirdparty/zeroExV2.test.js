import { toWei } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { partialRedeploy } from '~/deploy/scripts/deploy-system';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '~/tests/utils/zeroExV2';

describe('account-0x-trading', () => {
  let user, defaultTxOpts;
  let accounts;
  let weth, mln;
  let zeroExExchange, erc20Proxy;

  beforeAll(async () => {
    accounts = await web3.eth.getAccounts();
    const [deployer, taker] = accounts;
    defaultTxOpts = { from: deployer, gas: 8000000 };
    user = deployer;
    const deployed = await partialRedeploy([CONTRACT_NAMES.VERSION]);
    const contracts = deployed.contracts;

    weth = contracts.WETH;
    mln = contracts.MLN;
    zeroExExchange = contracts.ZeroExV2Exchange;
    erc20Proxy = contracts.ZeroExV2ERC20Proxy;

    await weth.methods
      .transfer(taker, toWei('100', 'Ether'))
      .send(defaultTxOpts);
  });

  test('Happy path', async () => {
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
