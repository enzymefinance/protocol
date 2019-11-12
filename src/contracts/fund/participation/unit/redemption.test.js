import { toWei } from 'web3-utils';

import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { randomAddress } from '~/utils/helpers/randomAddress';

describe('redemption', () => {
  let s = {};

  beforeAll(async () => {
    // Setup environment
    s.env = await initTestEnvironment();

    // Define user accounts
    s.user = s.env.wallet.address;
    s.standardGas = 8000000;
    s.defaultTxOpts = { from: s.user, gas: s.standardGas };

    // Setup necessary contracts
    s = {
      ...s,
      ...(await deployMockSystem(
        s.env,
        { accountingContract: Contracts.Accounting }
      ))
    }
  });

  it('Redeem with no shares fails', async () => {
    const errorMessage =
      'Sender does not have enough shares to fulfill request';

    const preShares = await s.shares.methods.balanceOf(s.user).call();

    await s.shares.methods
      .createFor(`${randomAddress()}`, '1000')
      .send(s.defaultTxOpts);

    expect(preShares).toBe('0');
    await expect(
      s.participation.methods
        .redeem()
        .send(s.defaultTxOpts),
    ).rejects.toThrow(errorMessage);
    await expect(
      s.participation.methods
        .redeemWithConstraints('1', [])
        .send(s.defaultTxOpts),
    ).rejects.toThrow(errorMessage);
  });

  it('Asset not in list prevents redemption', async () => {
    const errorMessage = 'Requested asset not in asset list';
    const addr = `${randomAddress()}`;

    await
      s.shares.methods.createFor(s.user, '1000')
      .send(s.defaultTxOpts);

    const preShares = await s.shares.methods.balanceOf(s.user).call();

    await expect(
      s.participation.methods
        .redeemWithConstraints('1', [addr])
        .send(s.defaultTxOpts),
    ).rejects.toThrow(errorMessage);

    const postShares = await s.shares.methods.balanceOf(s.user).call();

    expect(preShares).toBe(postShares);
  });

  it('Asset cannot be redeemed twice', async () => {
    const errorMessage = 'Asset can only be redeemed once';

    const preShares = await s.shares.methods.balanceOf(s.user).call();

    await expect(
      s.participation.methods
        .redeemWithConstraints('1', [
          s.weth.options.address,
          s.weth.options.address,
        ])
        .send(s.defaultTxOpts),
    ).rejects.toThrow(errorMessage);

    const postShares = await s.shares.methods.balanceOf(s.user).call();

    expect(preShares).toBe(postShares);
  });

  it('Vault-held assets can be redeemed', async () => {
    const wethAmount = toWei('1', 'ether');

    await s.weth.methods
      .transfer(s.vault.options.address, wethAmount)
      .send(s.defaultTxOpts);
    const heldWeth = await s.accounting.methods
      .assetHoldings(s.weth.options.address)
      .call();
    const preShares = await s.shares.methods
      .balanceOf(s.user)
      .call();

    expect(heldWeth).toBe(wethAmount);

    await s.participation.methods
      .redeemWithConstraints(preShares, [
        s.weth.options.address,
      ])
      .send(s.defaultTxOpts);

    const postShares = await s.shares.methods
      .balanceOf(s.user)
      .call();

    expect(postShares).toBe('0');
  });
});
