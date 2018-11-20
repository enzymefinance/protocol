import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
});

test('Exchanges are properly initialized', async () => {
  const mockExchanges = [
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  ];

  const mockExchangeAdapters = [
    '0xcccccccccccccccccccccccccccccccccccccccc',
    '0xdddddddddddddddddddddddddddddddddddddddd',
  ];

  const takesCustodyMasks = [true, false];

  const trading = getContract(
    Contracts.Trading,
    await deploy(Contracts.Trading, [
      shared.hub.options.address,
      mockExchanges,
      mockExchangeAdapters,
      takesCustodyMasks,
    ]),
  );

  for (const i of Array.from(Array(mockExchanges.length).keys())) {
    const exchangeObject = await trading.methods.exchanges(i).call();
    expect(exchangeObject.exchange.toLowerCase()).toBe(mockExchanges[i]);
    expect(exchangeObject.adapter.toLowerCase()).toBe(mockExchangeAdapters[i]);
    expect(exchangeObject.takesCustody).toBe(takesCustodyMasks[i]);
  }
});
