import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployMockSystem } from '~/utils/deployMockSystem';
import { deploy } from '~/utils/solidity/deploy';
import { getContract } from '~/utils/solidity/getContract';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { Contracts } from '~/Contracts';
import { BigInteger } from '@melonproject/token-math/bigInteger';

describe('shares', () => {
  let shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    shared = Object.assign(shared, await deployMockSystem(shared.env));
    shared.user = shared.env.wallet.address;
    shared.shares = getContract(
      shared.env,
      Contracts.Shares,
      await deploy(shared.env, Contracts.Shares, [shared.hub.options.address]),
    );
  });

  it('Shares contract is properly initialized', async () => {
    const hubName = await shared.hub.methods.name().call();
    await expect(shared.shares.methods.name().call()).resolves.toEqual(hubName);
    await expect(shared.shares.methods.symbol().call()).resolves.toBe('MLNF');
    await expect(shared.shares.methods.decimals().call()).resolves.toBe('18');
  });

  it('Create and destroy shares (auth)', async () => {
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
});
