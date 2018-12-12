import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { Contracts } from '~/Contracts';
import { LogLevels } from '~/utils/environment/Environment';

describe('redemption', () => {
  let debug;
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await initTestEnvironment();
    debug = shared.env.logger(
      'melon:protocol:test:redemption',
      LogLevels.DEBUG,
    );

    shared.mockDeploy = await deployMockSystem(shared.env, {
      accountingContract: Contracts.Accounting,
    });

    debug('mockDeploy', Object.keys(shared.mockDeploy));

    shared.user = shared.env.wallet.address;
  });

  it('Redeem with no shares fails', async () => {
    const errorMessage =
      'Sender does not have enough shares to fulfill request';
    const preShares = await shared.mockDeploy.shares.methods
      .balanceOf(shared.user)
      .call();

    await shared.mockDeploy.shares.methods
      .createFor(`${randomAddress()}`, '1000')
      .send({ from: shared.user });

    expect(preShares).toBe('0');
    await expect(
      shared.mockDeploy.participation.methods
        .redeem()
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);
    await expect(
      shared.mockDeploy.participation.methods
        .redeemWithConstraints('1', [])
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);
  });

  it('Asset not in list prevents redemption', async () => {
    const errorMessage = 'Requested asset not in asset list';
    const addr = `${randomAddress()}`;

    await shared.mockDeploy.shares.methods
      .createFor(`${shared.user}`, '1000')
      .send({ from: shared.user });

    const preShares = await shared.mockDeploy.shares.methods
      .balanceOf(shared.user)
      .call();

    await expect(
      shared.mockDeploy.participation.methods
        .redeemWithConstraints('1', [addr])
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);

    const postShares = await shared.mockDeploy.shares.methods
      .balanceOf(shared.user)
      .call();

    expect(preShares).toBe(postShares);
  });

  it('Asset cannot be redeemed twice', async () => {
    const errorMessage = 'Asset can only be redeemed once';

    const preShares = await shared.mockDeploy.shares.methods
      .balanceOf(shared.user)
      .call();

    await expect(
      shared.mockDeploy.participation.methods
        .redeemWithConstraints('1', [
          shared.mockDeploy.weth.options.address,
          shared.mockDeploy.weth.options.address,
        ])
        .send({ from: shared.user, gas: 8000000 }),
    ).rejects.toThrow(errorMessage);

    const postShares = await shared.mockDeploy.shares.methods
      .balanceOf(shared.user)
      .call();

    expect(preShares).toBe(postShares);
  });

  it('Vault-held assets can be redeemed', async () => {
    const wethAmount = '1000';
    await shared.mockDeploy.weth.methods
      .transfer(shared.mockDeploy.vault.options.address, wethAmount)
      .send({ from: shared.user });
    const heldWeth = await shared.mockDeploy.accounting.methods
      .assetHoldings(shared.mockDeploy.weth.options.address)
      .call();
    const preShares = await shared.mockDeploy.shares.methods
      .balanceOf(shared.user)
      .call();

    expect(heldWeth).toBe(wethAmount);

    await shared.mockDeploy.participation.methods
      .redeemWithConstraints(preShares, [
        shared.mockDeploy.weth.options.address,
      ])
      .send({ from: shared.user, gas: 8000000 });

    const postShares = await shared.mockDeploy.shares.methods
      .balanceOf(shared.user)
      .call();

    expect(postShares).toBe('0');
  });
});
