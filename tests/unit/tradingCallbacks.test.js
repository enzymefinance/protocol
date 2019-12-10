import { randomHex } from 'web3-utils';

import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';
import { getFunctionSignature } from '~/tests/utils/metadata';

describe('tradingCallbacks', () => {
  let user, defaultTxOpts;
  let mockAdapter;
  let mockSystem;
  let trading;
  let makeOrderSignature;

  const mockExchange = randomHex(20);

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    mockSystem = await deployMockSystem();

    makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    mockAdapter = await deploy(CONTRACT_NAMES.MOCK_ADAPTER),
    await mockSystem.registry.methods
      .registerExchangeAdapter(mockExchange, mockAdapter.options.address)
      .send({ from: user, gas: 8000000 });

    trading = await deploy(CONTRACT_NAMES.TRADING, [
      user, // faked so user can call initialize
      [mockExchange],
      [mockAdapter.options.address],
      mockSystem.registry.options.address,
    ]),

    await trading.methods
      .initialize([
        mockSystem.accounting.options.address,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        mockSystem.policyManager.options.address,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        mockSystem.registry.options.address,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
      ])
      .send(defaultTxOpts);
  });

  it('Make order associated callbacks add data to Trading spoke', async () => {
    const mockOrderId = 42;
    const makerQuantity = 100;
    const takerQuantity = 200;

    await trading.methods
      .callOnExchange(
        0,
        makeOrderSignature,
        [
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
          mockSystem.mln.options.address,
          mockSystem.weth.options.address,
          EMPTY_ADDRESS,
          EMPTY_ADDRESS,
        ],
        [makerQuantity, takerQuantity, 0, 0, 0, 0, 0, 0],
        `0x${Number(mockOrderId)
          .toString(16)
          .padStart(64, '0')}`,
        '0x0',
        '0x0',
        '0x0',
      )
      .send(defaultTxOpts);

    expect(
      await trading.methods
        .isInOpenMakeOrder(mockSystem.mln.options.address)
        .call(),
    ).toBeTruthy();

    const openOrderInfo = await trading.methods
      .getOpenOrderInfo(mockExchange, mockSystem.mln.options.address)
      .call();
    expect(Number(openOrderInfo[0])).toBe(mockOrderId);
    expect(Number(openOrderInfo[2])).toBe(0);

    const orderDetails = await trading.methods.getOrderDetails(0).call();
    expect(orderDetails[0]).toBe(mockSystem.mln.options.address);
    expect(orderDetails[1]).toBe(mockSystem.weth.options.address);
    expect(Number(orderDetails[2])).toBe(makerQuantity);
    expect(Number(orderDetails[3])).toBe(takerQuantity);
  });
});
