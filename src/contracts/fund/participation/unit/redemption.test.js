import { toWei } from 'web3-utils';

import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';

describe('redemption', () => {
  let environment, user, defaultTxOpts;
  let mockSystem;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };

    mockSystem = await deployMockSystem(
      environment,
      { accountingContract: Contracts.Accounting }
    );
  });

  it('Redeem with no shares fails', async () => {
    const errorMessage =
      'Sender does not have enough shares to fulfill request';

    const preShares = await mockSystem.shares.methods.balanceOf(user).call();

    await mockSystem.shares.methods
      .createFor(`${randomAddress()}`, '1000')
      .send(defaultTxOpts);

    expect(preShares).toBe('0');
    await expect(
      mockSystem.participation.methods
        .redeem()
        .send(defaultTxOpts),
    ).rejects.toThrow(errorMessage);
    await expect(
      mockSystem.participation.methods
        .redeemWithConstraints('1', [])
        .send(defaultTxOpts),
    ).rejects.toThrow(errorMessage);
  });

  it('Asset not in list prevents redemption', async () => {
    const errorMessage = 'Requested asset not in asset list';
    const addr = `${randomAddress()}`;

    await
      mockSystem.shares.methods.createFor(user, '1000')
      .send(defaultTxOpts);

    const preShares = await mockSystem.shares.methods.balanceOf(user).call();

    await expect(
      mockSystem.participation.methods
        .redeemWithConstraints('1', [addr])
        .send(defaultTxOpts),
    ).rejects.toThrow(errorMessage);

    const postShares = await mockSystem.shares.methods.balanceOf(user).call();

    expect(preShares).toBe(postShares);
  });

  it('Asset cannot be redeemed twice', async () => {
    const errorMessage = 'Asset can only be redeemed once';

    const preShares = await mockSystem.shares.methods.balanceOf(user).call();

    await expect(
      mockSystem.participation.methods
        .redeemWithConstraints('1', [
          mockSystem.weth.options.address,
          mockSystem.weth.options.address,
        ])
        .send(defaultTxOpts),
    ).rejects.toThrow(errorMessage);

    const postShares = await mockSystem.shares.methods.balanceOf(user).call();

    expect(preShares).toBe(postShares);
  });

  it('Vault-held assets can be redeemed', async () => {
    const wethAmount = toWei('1', 'ether');

    await mockSystem.weth.methods
      .transfer(mockSystem.vault.options.address, wethAmount)
      .send(defaultTxOpts);
    const heldWeth = await mockSystem.accounting.methods
      .assetHoldings(mockSystem.weth.options.address)
      .call();
    const preShares = await mockSystem.shares.methods
      .balanceOf(user)
      .call();

    expect(heldWeth).toBe(wethAmount);

    await mockSystem.participation.methods
      .redeemWithConstraints(preShares, [
        mockSystem.weth.options.address,
      ])
      .send(defaultTxOpts);

    const postShares = await mockSystem.shares.methods
      .balanceOf(user)
      .call();

    expect(postShares).toBe('0');
  });
});
