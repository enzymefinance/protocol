import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';
import {
  makeOrderSignature,
  takeOrderSignature,
  emptyAddress,
} from '~/utils/constants';
import { randomAddress } from '~/utils/helpers';

let shared: any = {};

const mockExchange = randomAddress().toString();

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = await Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  const mockAdapter = await getContract(
    Contracts.MockAdapter,
    await deploy(Contracts.MockAdapter),
  );
  shared.trading = await getContract(
    Contracts.Trading,
    await deploy(Contracts.Trading, [
      shared.hub.options.address,
      [mockExchange],
      [mockAdapter.options.address],
      [false],
    ]),
  );
  await shared.trading.methods
    .initialize([
      shared.accounting.options.address,
      emptyAddress,
      emptyAddress,
      shared.policyManager.options.address,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
      emptyAddress,
    ])
    .send({ from: shared.user, gas: 8000000 });
});

test('Make order associated callbacks add data to Trading spoke', async () => {
  const mockOrderId = 42;
  const makerQuantity = 100;
  const takerQuantity = 200;
  await shared.trading.methods
    .callOnExchange(
      0,
      makeOrderSignature,
      [
        emptyAddress,
        emptyAddress,
        shared.mln.options.address,
        shared.weth.options.address,
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
    .send({ from: shared.user, gas: 8000000 });

  expect(
    await shared.trading.methods
      .isInOpenMakeOrder(shared.mln.options.address)
      .call(),
  ).toBeTruthy();

  const openOrderInfo = await shared.trading.methods
    .getOpenOrderInfo(mockExchange, shared.mln.options.address)
    .call();
  expect(Number(openOrderInfo[0])).toBe(mockOrderId);
  expect(Number(openOrderInfo[2])).toBe(0);

  const orderDetails = await shared.trading.methods.getOrderDetails(0).call();
  expect(orderDetails[0]).toBe(shared.mln.options.address);
  expect(orderDetails[1]).toBe(shared.weth.options.address);
  expect(Number(orderDetails[2])).toBe(makerQuantity);
  expect(Number(orderDetails[3])).toBe(takerQuantity);
});
