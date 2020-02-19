import { toWei, randomHex } from 'web3-utils';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';

describe('shares', () => {
  let user, defaultTxOpts;
  let mockSystem;
  let shares;

  beforeAll(async () => {
    mockSystem = await deployMockSystem({sharesContract: CONTRACT_NAMES.SHARES});
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaultTxOpts = { from: user, gas: 8000000 };
    shares = mockSystem.shares;
  });

  test('Shares contract is properly initialized', async () => {
    const hubName = await mockSystem.hub.methods.name().call();
    await expect(shares.methods.name().call()).resolves.toEqual(hubName);
    await expect(shares.methods.symbol().call()).resolves.toBe('MLNF');
    await expect(shares.methods.decimals().call()).resolves.toBe('18');
  });

  test('Create and destroy shares (auth)', async () => {
    const mockAccount = randomHex(20);
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
