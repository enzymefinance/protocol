import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';
import { randomAddress } from '~/utils/helpers';
import { Contracts } from '~/Contracts';
import { BigInteger } from '@melonproject/token-math/bigInteger';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  shared.shares = getContract(
    Contracts.Shares,
    await deploy(Contracts.Shares, [shared.hub.options.address]),
  );
});

test('Shares contract is properly initialized', async () => {
  const hubName = await shared.hub.methods.name().call();
  await expect(shared.shares.methods.name().call()).resolves.toEqual(hubName);
  await expect(shared.shares.methods.symbol().call()).resolves.toBe('MLNF');
  await expect(shared.shares.methods.decimals().call()).resolves.toBe('18');
});

test('Create and destroy shares (auth)', async () => {
  const mockAccount = randomAddress().toString();
  const amount = new BigInteger(1000000000);
  await expect(
    shared.shares.methods.balanceOf(mockAccount).call(),
  ).resolves.toEqual('0');

  await shared.shares.methods
    .createFor(mockAccount, `${amount}`)
    .send({ from: shared.user });
  await expect(
    shared.shares.methods.balanceOf(mockAccount).call(),
  ).resolves.toEqual(amount);

  await shared.shares.methods
    .destroyFor(mockAccount, `${amount}`)
    .send({ from: shared.user });
  await expect(
    shared.shares.methods.balanceOf(mockAccount).call(),
  ).resolves.toEqual('0');
});
