import { deployAndGetContract as deploy } from '~/utils/solidity';
import { deployMockSystem } from '~/utils';
import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment';
import { emptyAddress } from '~/utils/constants';
import * as Web3Utils from 'web3-utils';

let shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  shared.quote = shared.weth.options.address;
  shared.nonQuote = shared.mln.options.address;
});

test.each([
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
  const uniqueSig = Web3Utils.sha3(name).substring(0, 10);
  const policy = await deploy(Contracts.MaxConcentration, [trial.max]);
  const trialAsset = shared[trial.asset];

  expect(await policy.methods.maxConcentration().call()).toBe(trial.max);

  await shared.policyManager.methods
    .register(uniqueSig, policy.options.address)
    .send({ from: shared.user });
  await shared.accounting.methods
    .setAssetGAV(trialAsset, trial.asset_gav)
    .send({ from: shared.user });
  await shared.accounting.methods
    .setGav(trial.total_gav)
    .send({ from: shared.user });

  const evaluate = shared.policyManager.methods.postValidate(
    uniqueSig,
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
