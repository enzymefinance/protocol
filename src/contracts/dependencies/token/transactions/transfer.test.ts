import initTestEnvironment from '~/utils/environment/initTestEnvironment';
import constructEnvironment from '~/utils/environment/constructEnvironment';

import deploy from './deploy';
import transfer from './transfer';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.address = await deploy();
});

test('transfer', async () => {
  const receipt = await transfer(shared.address, {
    to: '0x1fEE0Ee72120B6A34C0FCdC93051Eb699a0D378B',
    tokens: '1000000000000000000',
  });

  expect(receipt).toBeTruthy();
});

// TODO: Make this test work
test.skip('insufficent balance', async () => {
  await expect(
    transfer(shared.address, {
      to: '0x1fEE0Ee72120B6A34C0FCdC93051Eb699a0D378B',
      tokens: '2000000000000000000000000',
    }),
  ).rejects.toThrow('balance');
});

test('no account address', async () => {
  const emptyEnvironment = constructEnvironment({});

  await expect(
    transfer(
      shared.address,
      {
        to: '0x1fEE0Ee72120B6A34C0FCdC93051Eb699a0D378B',
        tokens: '1000000000000000000',
      },
      emptyEnvironment,
    ),
  ).rejects.toThrow('No address');
});
