import { deploy0xExchange } from '~/contracts/exchanges/transactions/deploy0xExchange';
import { stringifyStruct } from '~/utils/solidity/stringifyStruct';
import {
  createUnsignedZeroExOrder,
  signZeroExOrder,
} from '../utils/new/zeroEx';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { getContract } from '~/utils/solidity/getContract';
import { toWei } from 'web3-utils';
import { AssetProxyId } from '@0x/types';
import { CONTRACT_NAMES } from '../utils/new/constants';

describe('account-0x-trading', () => {
  let environment, user, defaultTxOpts, takerEnvironment;
  let accounts;
  let weth, mln;
  let zeroExExchange, erc20ProxyAddress;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };
    accounts = await environment.eth.getAccounts();
    takerEnvironment = withDifferentAccount(environment, accounts[1]);

    const zrxTokenInfo = await getToken(
      environment,
      await deployToken(environment, 'ZRX'),
    );

    mln = getContract(
      environment,
      CONTRACT_NAMES.STANDARD_TOKEN,
      await deployToken(environment, 'MLN'),
    );

    weth = getContract(
      environment,
      CONTRACT_NAMES.PREMINED_TOKEN,
      await deployToken(environment, 'WETH'),
    );
    await weth.methods
      .transfer(takerEnvironment.wallet.address, toWei('100', 'Ether'))
      .send(defaultTxOpts);

    const zrxExchangeAddress = await deploy0xExchange(environment, {
      zrxToken: zrxTokenInfo,
    });

    zeroExExchange = getContract(
      environment,
      CONTRACT_NAMES.ZERO_EX_EXCHANGE,
      zrxExchangeAddress,
    );

    erc20ProxyAddress = await zeroExExchange.methods
      .getAssetProxy(AssetProxyId.ERC20.toString())
      .call();
  });

  it('Happy path', async () => {
    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedZeroExOrder(
      environment,
      zeroExExchange.options.address,
      {
        makerAddress: user,
        makerTokenAddress: mln.options.address,
        makerAssetAmount,
        takerTokenAddress: weth.options.address,
        takerAssetAmount,
      }
    );

    // await approveOrder(environment, zrxExchangeAddress, unsignedOrder);
    await mln.methods
      .approve(erc20ProxyAddress, makerAssetAmount)
      .send(defaultTxOpts);

    const signedOrder = await signZeroExOrder(environment, unsignedOrder, user);
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
