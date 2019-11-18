import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { FunctionSignatures } from '../utils/FunctionSignatures';

describe('tradingCallbacks', () => {
  let environment, user, defaultTxOpts;
  let mockAdapter;
  let mockSystem;
  let trading;

  const mockExchange = randomAddress().toString();

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };
    mockSystem = await deployMockSystem(environment);
    user = environment.wallet.address;
    mockAdapter = await getContract(
      environment,
      Contracts.MockAdapter,
      await deployContract(environment, Contracts.MockAdapter),
    );
    await mockSystem.registry.methods
      .registerExchangeAdapter(mockExchange, mockAdapter.options.address)
      .send({ from: user });

    trading = await getContract(
      environment,
      Contracts.Trading,
      await deployContract(environment, Contracts.Trading, [
        user, // faked so user can call initialize
        [mockExchange],
        [mockAdapter.options.address],
        mockSystem.registry.options.address,
      ]),
    );

    await trading.methods
      .initialize([
        mockSystem.accounting.options.address,
        emptyAddress,
        emptyAddress,
        mockSystem.policyManager.options.address,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        mockSystem.registry.options.address,
        emptyAddress,
        emptyAddress,
        emptyAddress,
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
        FunctionSignatures.makeOrder,
        [
          emptyAddress,
          emptyAddress,
          mockSystem.mln.options.address,
          mockSystem.weth.options.address,
          emptyAddress,
          emptyAddress,
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
