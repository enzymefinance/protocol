import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { deployContract } from '~/utils/solidity/deployContract';
import { getContract } from '~/utils/solidity/getContract';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { Contracts } from '~/Contracts';
import { toWei } from 'web3-utils';

describe('shares', () => {
  let environment, user, defaultTxOpts;
  let mockSystem;
  let shares;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    mockSystem = await deployMockSystem(environment);
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    shares = getContract(
      environment,
      Contracts.Shares,
      await deployContract(environment, Contracts.Shares, [
        mockSystem.hub.options.address,
      ]),
    );
  });

  it('Shares contract is properly initialized', async () => {
    const hubName = await mockSystem.hub.methods.name().call();
    await expect(shares.methods.name().call()).resolves.toEqual(hubName);
    await expect(shares.methods.symbol().call()).resolves.toBe('MLNF');
    await expect(shares.methods.decimals().call()).resolves.toBe('18');
  });

  it('Create and destroy shares (auth)', async () => {
    const mockAccount = randomAddress().toString();
    const amount = toWei('1', 'Ether');
    await expect(
      shares.methods.balanceOf(mockAccount).call(),
    ).resolves.toEqual('0');

    await shares.methods
      .createFor(mockAccount, `${amount}`)
      .send(defaultTxOpts);
    await expect(
      shares.methods.balanceOf(mockAccount).call(),
    ).resolves.toEqual(amount);

    await shares.methods
      .destroyFor(mockAccount, `${amount}`)
      .send(defaultTxOpts);
    await expect(
      shares.methods.balanceOf(mockAccount).call(),
    ).resolves.toEqual('0');
  });
});
