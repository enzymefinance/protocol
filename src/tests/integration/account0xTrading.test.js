import { deploy0xExchange } from '~/contracts/exchanges/transactions/deploy0xExchange';
import { stringifyStruct } from '~/utils/solidity/stringifyStruct';
import {
  createUnsignedOrder,
  approveOrder,
} from '~/contracts/exchanges/third-party/0x/utils/createOrder';
import { signOrder } from '~/contracts/exchanges/third-party/0x/utils/signOrder';
import { fillOrder } from '~/contracts/exchanges/third-party/0x/transactions/fillOrder';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { withDifferentAccount } from '~/utils/environment/withDifferentAccount';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { deployToken } from '~/contracts/dependencies/token/transactions/deploy';
import { Contracts } from '~/Contracts';
import { getContract } from '~/utils/solidity/getContract';
import { toWei } from 'web3-utils';

describe('account-0x-trading', () => {
  let environment, user, defaultTxOpts, takerEnvironment;
  let accounts;
  let wethTokenInfo, mlnTokenInfo, zrxTokenInfo;
  let zrxExchangeAddress;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };
    accounts = await environment.eth.getAccounts();
    takerEnvironment = withDifferentAccount(environment, accounts[1]);

    wethTokenInfo = await getToken(
      environment,
      await deployToken(environment, 'WETH'),
    );
    mlnTokenInfo = await getToken(
      environment,
      await deployToken(environment, 'MLN'),
    );
    zrxTokenInfo = await getToken(
      environment,
      await deployToken(environment, 'ZRX'),
    );

    const weth = getContract(
      environment,
      Contracts.PreminedToken,
      wethTokenInfo.address
    );
    await weth.methods
      .transfer(takerEnvironment.wallet.address, toWei('100', 'Ether'))
      .send(defaultTxOpts);

    zrxExchangeAddress = await deploy0xExchange(environment, {
      zrxToken: zrxTokenInfo,
    });
  });

  it('Happy path', async () => {
    const makerAssetAmount = toWei('1', 'Ether');
    const takerAssetAmount = toWei('0.05', 'Ether');

    const unsignedOrder = await createUnsignedOrder(
      environment,
      zrxExchangeAddress,
      {
        makerTokenInfo: mlnTokenInfo,
        makerAssetAmount,
        takerTokenInfo: wethTokenInfo,
        takerAssetAmount,
      }
    );

    await approveOrder(environment, zrxExchangeAddress, unsignedOrder);

    const signedOrder = await signOrder(environment, unsignedOrder);
    expect(signedOrder.exchangeAddress).toBe(
      zrxExchangeAddress.toLowerCase(),
    );
    expect(signedOrder.makerAddress).toBe(accounts[0].toLowerCase());
    expect(signedOrder.makerAssetAmount.toString()).toBe(makerAssetAmount);

    const exchange = getContract(
      environment,
      Contracts.ZeroExExchange,
      zrxExchangeAddress
    );

    const stringifiedSignedOrder = stringifyStruct(signedOrder);
    const signature = stringifiedSignedOrder.signature;
    const result = await exchange.methods.fillOrder(
      stringifyStruct(unsignedOrder),
      takerAssetAmount,
      signature,
    ).send(defaultTxOpts);

    expect(result).toBeTruthy();
  });
});
