import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';
import { randomAddress } from '~/utils/helpers';

let shared: any = {};

// Mock data
const mockExchanges = [randomAddress(), randomAddress()];

const mockExchangeAdapters = [randomAddress(), randomAddress()];

const takesCustodyMasks = [true, false];

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
});

test('Exchanges are properly initialized', async () => {
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
    await expect(
      trading.methods.exchangeIsAdded(mockExchanges[i]).call(),
    ).toBeTruthy();
  }
});

test('Exchanges cant be initialized without its adapter', async () => {
  const errorMessage = 'Array lengths unequal';

  await expect(
    deploy(Contracts.Trading, [
      shared.hub.options.address,
      mockExchanges,
      [mockExchangeAdapters[0]],
      takesCustodyMasks,
    ]),
  ).rejects.toThrow(errorMessage);
});
