import { randomHex } from 'web3-utils';

import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/new/constants';
import { getFunctionSignature } from '~/tests/utils/new/metadata';

describe('tradingCallbacks', () => {
  let environment, user, defaultTxOpts;
  let mockAdapter;
  let mockSystem;
  let trading;
  let makeOrderSignature;

  const mockExchange = randomHex(20);

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };
    mockSystem = await deployMockSystem(environment);
    user = environment.wallet.address;

    makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    mockAdapter = await getContract(
      environment,
      CONTRACT_NAMES.MOCK_ADAPTER,
      await deployContract(environment, CONTRACT_NAMES.MOCK_ADAPTER),
    );
    await mockSystem.registry.methods
      .registerExchangeAdapter(mockExchange, mockAdapter.options.address)
      .send({ from: user });

    trading = await getContract(
      environment,
      CONTRACT_NAMES.TRADING,
      await deployContract(environment, CONTRACT_NAMES.TRADING, [
        user, // faked so user can call initialize
        [mockExchange],
        [mockAdapter.options.address],
        mockSystem.registry.options.address,
      ]),
    );

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
