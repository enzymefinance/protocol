import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { makeOrderSignatureBytes } from '~/utils/constants/orderSignatures';

describe('maxPositions', () => {
  let environment, user, defaultTxOpts;
  let mockSystem;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    mockSystem = await deployMockSystem(environment);
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };
  });

  it('Create and get max', async () => {
    const positions = ['0', '125', '9999999999'];
    for (const n of positions) {
      const maxPositions = await deploy(environment, Contracts.MaxPositions, [
        n,
      ]);
      expect(await maxPositions.methods.maxPositions().call()).toEqual(n);
    }
  });

  it('Policy manager and mock accounting with maxPositions', async () => {
    const maxPositions = '3';
    const policy = await deploy(environment, Contracts.MaxPositions, [
      maxPositions,
    ]);
    const nonQuoteAsset = `${randomAddress()}`;
    const quoteAsset = mockSystem.weth.options.address;
    await mockSystem.policyManager.methods
      .register(makeOrderSignatureBytes, policy.options.address)
      .send(defaultTxOpts);
    await mockSystem.accounting.methods
      .setOwnedAssets([mockSystem.weth.options.address])
      .send(defaultTxOpts);

    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          makeOrderSignatureBytes,
          [emptyAddress, emptyAddress, emptyAddress, quoteAsset, emptyAddress],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).resolves.not.toThrow();
    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          makeOrderSignatureBytes,
          [
            emptyAddress,
            emptyAddress,
            emptyAddress,
            nonQuoteAsset,
            emptyAddress,
          ],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).resolves.not.toThrow();

    await mockSystem.accounting.methods
      .setOwnedAssets([
        nonQuoteAsset,
        `${randomAddress()}`,
        `${randomAddress()}`,
      ])
      .send(defaultTxOpts);

    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          makeOrderSignatureBytes,
          [emptyAddress, emptyAddress, emptyAddress, quoteAsset, emptyAddress],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).resolves.not.toThrow();
    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          makeOrderSignatureBytes,
          [
            emptyAddress,
            emptyAddress,
            emptyAddress,
            nonQuoteAsset,
            emptyAddress,
          ],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).resolves.not.toThrow();

    await mockSystem.accounting.methods
      .setOwnedAssets([
        nonQuoteAsset,
        `${randomAddress()}`,
        `${randomAddress()}`,
        `${randomAddress()}`,
      ])
      .send(defaultTxOpts);

    await expect(
      mockSystem.policyManager.methods
        .postValidate(
          makeOrderSignatureBytes,
          [
            emptyAddress,
            emptyAddress,
            emptyAddress,
            `${randomAddress()}`,
            emptyAddress,
          ],
          [0, 0, 0],
          '0x0',
        )
        .call(),
    ).rejects.toThrow('Rule evaluated to false');
  });
});
