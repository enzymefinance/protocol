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
  let takeOrderSignature, takeOrderSignatureBytes;

  beforeAll(async () => {
    mockSystem = await deployMockSystem();
    const accounts = await web3.eth.getAccounts();
    user = accounts[0]
    defaultTxOpts = { from: user, gas: 8000000 };
    mockSystem.quote = mockSystem.weth.options.address;
    mockSystem.nonQuote = mockSystem.mln.options.address;

    takeOrderSignature = getFunctionSignature(
      CONTRACT_NAMES.EXCHANGE_ADAPTER,
      'takeOrder',
    );

    takeOrderSignatureBytes = encodeFunctionSignature(
      takeOrderSignature
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

  // choose makerTokenQuantityBeingTraded = takerTokenQuantityBeingTraded * 2
  // so that makerTokenGavBeingTraded = takerTokenGavBeingTraded => the totalGav won't change
  // which helps us write tests more easily

  test.each([
    [
      'Asset gav > concentration limit',
      {
        max: toWei('0.1', 'ether'),
        asset: 'nonQuote',
        current_asset_gav: toWei('0.10001', 'ether'),
        takerTokenQuantityBeingTraded: toWei('0.00001', 'ether'),
        makerTokenQuantityBeingTraded: toWei('0.00002', 'ether'),
        total_gav: toWei('1', 'ether'),
        expectPass: false,
      },
    ],
    [
      'Asset gav == concentration limit',
      {
        max: toWei('0.1', 'ether'),
        asset: 'nonQuote',
        current_asset_gav: toWei('0.01', 'ether'),
        takerTokenQuantityBeingTraded: toWei('0.09', 'ether'),
        makerTokenQuantityBeingTraded: toWei('0.18', 'ether'),
        total_gav: toWei('1', 'ether'),
        expectPass: true,
      },
    ],
    [
      'Asset gav < concentration limit',
      {
        max: toWei('0.1', 'ether'),
        asset: 'nonQuote',
        current_asset_gav: toWei('0.01', 'ether'),
        takerTokenQuantityBeingTraded: toWei('0.08', 'ether'),
        makerTokenQuantityBeingTraded: toWei('0.16', 'ether'),
        total_gav: toWei('1', 'ether'),
        expectPass: true,
      },
    ],
    [
      'Quote asset gav > concentration limit',
      {
        max: toWei('0.1', 'ether'),
        asset: 'quote',
        current_asset_gav: toWei('0.11', 'ether'),
        takerTokenQuantityBeingTraded: toWei('0.9', 'ether'),
        makerTokenQuantityBeingTraded: toWei('1.8', 'ether'),
        total_gav: toWei('1', 'ether'),
        expectPass: true,
      },
    ],
  ])('%s', async (_, trial) => {
    const policy = await deploy(CONTRACT_NAMES.MAX_CONCENTRATION, [
      trial.max,
    ]);
    const trialAsset = mockSystem[trial.asset];

    expect(await policy.methods.maxConcentration().call()).toBe(trial.max);

    await mockSystem.policyManager.methods
      .register(takeOrderSignatureBytes, policy.options.address)
      .send(defaultTxOpts);
    await mockSystem.accounting.methods
      .setAssetGAV(trialAsset, trial.current_asset_gav)
      .send(defaultTxOpts);
    await mockSystem.accounting.methods
      .setGav(trial.total_gav)
      .send(defaultTxOpts);

    const evaluate = mockSystem.policyManager.methods.postValidate(
      takeOrderSignatureBytes,
      [EMPTY_ADDRESS, EMPTY_ADDRESS, trialAsset, mockSystem.quote, EMPTY_ADDRESS],
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
