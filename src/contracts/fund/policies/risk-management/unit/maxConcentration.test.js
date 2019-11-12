import { deployAndGetContract as deploy } from '~/utils/solidity/deployAndGetContract';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { makeOrderSignatureBytes } from '~/utils/constants/orderSignatures';

describe('maxConcentration', () => {
  let environment, user, defaultTxOpts;
  let mockSystem;

  beforeAll(async () => {
    environment = await initTestEnvironment();
    mockSystem = await  deployMockSystem(environment);
    user = environment.wallet.address;
    defaultTxOpts = { from: user, gas: 8000000 };
    mockSystem.quote = mockSystem.weth.options.address;
    mockSystem.nonQuote = mockSystem.mln.options.address;
  });

  it.each([
    [
      'Asset gav > concentration limit',
      {
        max: '100000000000000000',
        asset: 'nonQuote',
        asset_gav: '100010000000000000',
        total_gav: '1000000000000000000',
        expectPass: false,
      },
    ],
    [
      'Asset gav == concentration limit',
      {
        max: '100000000000000000',
        asset: 'nonQuote',
        asset_gav: '100000000000000000',
        total_gav: '1000000000000000000',
        expectPass: true,
      },
    ],
    [
      'Asset gav < concentration limit',
      {
        max: '100000000000000000',
        asset: 'nonQuote',
        asset_gav: '90000000000000000',
        total_gav: '1000000000000000000',
        expectPass: true,
      },
    ],
    [
      'Quote asset gav > concentration limit',
      {
        max: '100000000000000000',
        asset: 'quote',
        asset_gav: '1000000000000000000',
        total_gav: '1000000000000000000',
        expectPass: true,
      },
    ],
  ])('%s', async (name, trial) => {
    const policy = await deploy(environment, Contracts.MaxConcentration, [
      trial.max,
    ]);
    const trialAsset = mockSystem[trial.asset];

    expect(await policy.methods.maxConcentration().call()).toBe(trial.max);

    await mockSystem.policyManager.methods
      .register(makeOrderSignatureBytes, policy.options.address)
      .send(defaultTxOpts);
    await mockSystem.accounting.methods
      .setAssetGAV(trialAsset, trial.asset_gav)
      .send(defaultTxOpts);
    await mockSystem.accounting.methods
      .setGav(trial.total_gav)
      .send(defaultTxOpts);

    const evaluate = mockSystem.policyManager.methods.postValidate(
      makeOrderSignatureBytes,
      [emptyAddress, emptyAddress, emptyAddress, trialAsset, emptyAddress],
      [0, 0, 0],
      '0x0',
    );
    if (trial.expectPass) {
      await expect(evaluate.call()).resolves.not.toThrow();
    } else {
      await expect(evaluate.call()).rejects.toThrow('Rule evaluated to false');
    }
  });
});
