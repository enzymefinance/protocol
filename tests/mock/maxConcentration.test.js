import { encodeFunctionSignature } from 'web3-eth-abi';

import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { toWei } from 'web3-utils';

import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';
import { getFunctionSignature } from '~/tests/utils/metadata';

describe('maxConcentration', () => {
  let user, defaultTxOpts;
  let mockSystem;
  let makeOrderSignature, makeOrderSignatureBytes;

  beforeAll(async () => {
    mockSystem = await deployMockSystem();
    const accounts = await web3.eth.getAccounts();
    user = accounts[0]
    defaultTxOpts = { from: user, gas: 8000000 };
    mockSystem.quote = mockSystem.weth.options.address;
    mockSystem.nonQuote = mockSystem.mln.options.address;

    makeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'makeOrder',
    );

    makeOrderSignatureBytes = encodeFunctionSignature(
      makeOrderSignature
    );

    const wethRateConstant = toWei('1', 'ether');
    const wethToMlnRate = toWei('0.5', 'ether');
    await mockSystem.priceSource.methods
      .update(
        [
          mockSystem.quote,
          mockSystem.nonQuote,
        ],
        [
          wethRateConstant,
          wethToMlnRate,
        ]
      )
      .send(defaultTxOpts);
  });

  // choose takerTokenQuantityBeingTraded = makerTokenQuantityBeingTraded * 2
  // so that takerTokenGavBeingTraded = makerTokenGavBeingTraded => the totalGav won't change
  // which helps us write tests more easily

  it.each([
    [
      'Asset gav > concentration limit',
      {
        max: '100000000000000000',
        asset: 'nonQuote',
        current_asset_gav: '10000000000000',
        makerTokenQuantityBeingTraded: '100000000000000000',
        takerTokenQuantityBeingTraded: '200000000000000000',
        total_gav: '1000000000000000000',
        expectPass: false,
      },
    ],
    [
      'Asset gav == concentration limit',
      {
        max: '100000000000000000',
        asset: 'nonQuote',
        current_asset_gav: '10000000000000000',
        makerTokenQuantityBeingTraded: '90000000000000000',
        takerTokenQuantityBeingTraded: '180000000000000000',
        total_gav: '1000000000000000000',
        expectPass: true,
      },
    ],
    [
      'Asset gav < concentration limit',
      {
        max: '100000000000000000',
        asset: 'nonQuote',
        current_asset_gav: '10000000000000000',
        makerTokenQuantityBeingTraded: '80000000000000000',
        takerTokenQuantityBeingTraded: '160000000000000000',
        total_gav: '1000000000000000000',
        expectPass: true,
      },
    ],
    [
      'Quote asset gav > concentration limit',
      {
        max: '100000000000000000',
        asset: 'quote',
        current_asset_gav: '100000000000000000',
        makerTokenQuantityBeingTraded: '900000000000000000',
        takerTokenQuantityBeingTraded: '1800000000000000000',
        total_gav: '1000000000000000000',
        expectPass: true,
      },
    ],
  ])('%s', async (name, trial) => {
    const policy = await deploy(CONTRACT_NAMES.MAX_CONCENTRATION, [
      trial.max,
    ]);
    const trialAsset = mockSystem[trial.asset];

    expect(await policy.methods.maxConcentration().call()).toBe(trial.max);

    await mockSystem.policyManager.methods
      .register(makeOrderSignatureBytes, policy.options.address)
      .send(defaultTxOpts);
    await mockSystem.accounting.methods
      .setAssetGAV(trialAsset, trial.current_asset_gav)
      .send(defaultTxOpts);
    await mockSystem.accounting.methods
      .setGav(trial.total_gav)
      .send(defaultTxOpts);

    const evaluate = mockSystem.policyManager.methods.postValidate(
      makeOrderSignatureBytes,
      [EMPTY_ADDRESS, EMPTY_ADDRESS, mockSystem.quote, trialAsset, EMPTY_ADDRESS],
      [trial.makerTokenQuantityBeingTraded, trial.takerTokenQuantityBeingTraded, 0],
      '0x0',
    );
    if (trial.expectPass) {
      await expect(evaluate.call()).resolves.not.toThrow();
    } else {
      await expect(evaluate.call()).rejects.toThrow('Rule evaluated to false');
    }
  });
});
