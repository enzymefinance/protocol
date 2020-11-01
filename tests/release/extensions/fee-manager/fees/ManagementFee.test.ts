import { BigNumber, constants, utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import {
  ComptrollerLib,
  FeeHook,
  FeeSettlementType,
  ManagementFee,
  managementFeeConfigArgs,
  managementFeeSharesDue,
  VaultLib,
} from '@melonproject/protocol';
import {
  assertEvent,
  defaultTestDeployment,
  transactionTimestamp,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Create standalone ManagementFee
  const [EOAFeeManager, ...remainingAccounts] = accounts;
  const standaloneManagementFee = await ManagementFee.deploy(
    config.deployer,
    EOAFeeManager,
  );

  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.totalSupply.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  // Add fee settings for ComptrollerProxy
  const managementFeeRate = utils.parseEther('.1'); // 10%
  const managementFeeConfig = managementFeeConfigArgs(managementFeeRate);
  await standaloneManagementFee
    .connect(EOAFeeManager)
    .addFundSettings(mockComptrollerProxy, managementFeeConfig);

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    EOAFeeManager,
    managementFeeRate,
    mockComptrollerProxy,
    mockVaultProxy,
    standaloneManagementFee,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { feeManager, managementFee },
    } = await provider.snapshot(snapshot);

    const getFeeManagerCall = await managementFee.getFeeManager();
    expect(getFeeManagerCall).toMatchAddress(feeManager);

    // Implements expected hooks
    const implementedHooksCall = await managementFee.implementedHooks();
    expect(implementedHooksCall).toMatchObject([
      FeeHook.Continuous,
      FeeHook.PreBuyShares,
      FeeHook.PreRedeemShares,
    ]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      managementFeeRate,
      mockComptrollerProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const managementFeeConfig = managementFeeConfigArgs(managementFeeRate);
    await expect(
      standaloneManagementFee.addFundSettings(
        mockComptrollerProxy,
        managementFeeConfig,
      ),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      EOAFeeManager,
      managementFeeRate,
      mockComptrollerProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const managementFeeConfig = managementFeeConfigArgs(managementFeeRate);
    const receipt = await standaloneManagementFee
      .connect(EOAFeeManager)
      .addFundSettings(mockComptrollerProxy, managementFeeConfig);

    // Assert the FundSettingsAdded event was emitted
    assertEvent(receipt, 'FundSettingsAdded', {
      comptrollerProxy: mockComptrollerProxy,
      rate: managementFeeRate,
    });

    // managementFeeRate should be set for comptrollerProxy
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );

    expect(getFeeInfoForFundCall).toMatchFunctionOutput(
      standaloneManagementFee.getFeeInfoForFund.fragment,
      {
        rate: managementFeeRate,
        lastSettled: BigNumber.from(0),
      },
    );
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const {
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const payoutCall = await standaloneManagementFee.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .call();

    expect(payoutCall).toBe(false);
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const settleTx = standaloneManagementFee.settle(
      mockComptrollerProxy,
      mockVaultProxy,
      FeeHook.Continuous,
      '0x',
    );

    await expect(settleTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles shares supply of 0', async () => {
    const {
      EOAFeeManager,
      managementFeeRate,
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Check the return value via a call
    const settleCall = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(
        mockComptrollerProxy,
        mockVaultProxy,
        FeeHook.Continuous,
        '0x',
      )
      .call();

    expect(settleCall).toMatchFunctionOutput(
      standaloneManagementFee.settle.fragment,
      {
        settlementType_: FeeSettlementType.None,
        sharesDue_: BigNumber.from(0),
      },
    );

    // Send the tx to actually settle
    const receipt = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x');

    // Settled event emitted
    assertEvent(receipt, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: BigNumber.from(0),
      prevSettled: BigNumber.from(0),
    });

    const settlementTimestamp = await transactionTimestamp(receipt);

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );

    expect(getFeeInfoForFundCall).toMatchFunctionOutput(
      standaloneManagementFee.getFeeInfoForFund.fragment,
      {
        rate: managementFeeRate,
        lastSettled: BigNumber.from(settlementTimestamp),
      },
    );
  });

  it('correctly handles shares supply >0', async () => {
    const {
      EOAFeeManager,
      managementFeeRate,
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Settle while shares supply is 0 to set lastSettled
    const receiptOne = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x');
    const settlementTimestampOne = await transactionTimestamp(receiptOne);

    // Update shares supply on mock
    const sharesSupply = utils.parseEther('1');
    await mockVaultProxy.totalSupply.returns(sharesSupply);

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    // Get the expected shares due for a call() to settle()
    // The call() adds 1 second to the last block timestamp
    const expectedSharesDueForCall = managementFeeSharesDue({
      rate: managementFeeRate,
      sharesSupply,
      secondsSinceLastSettled: BigNumber.from(secondsToWarp).add(1),
    });

    // Check the return values via a call() to settle()
    const settleCall = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(
        mockComptrollerProxy,
        mockVaultProxy,
        FeeHook.Continuous,
        '0x',
      )
      .call();

    expect(settleCall).toMatchFunctionOutput(
      standaloneManagementFee.settle.fragment,
      {
        settlementType_: FeeSettlementType.Mint,
        sharesDue_: expectedSharesDueForCall,
      },
    );

    // Send the tx to actually settle()
    const receiptTwo = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x');
    const settlementTimestampTwo = await transactionTimestamp(receiptTwo);

    // Get the expected shares due for the actual settlement
    const expectedSharesDueForTx = managementFeeSharesDue({
      rate: managementFeeRate,
      sharesSupply,
      secondsSinceLastSettled: BigNumber.from(settlementTimestampTwo).sub(
        settlementTimestampOne,
      ),
    });

    // Settled event emitted with correct settlement values
    assertEvent(receiptTwo, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: expectedSharesDueForTx,
      prevSettled: BigNumber.from(settlementTimestampOne),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(
      standaloneManagementFee.getFeeInfoForFund.fragment,
      {
        rate: managementFeeRate,
        lastSettled: BigNumber.from(settlementTimestampTwo),
      },
    );
  });

  // How can we batch 2 txs into the same block?
  it.todo('returns 0 if lastSettled is the same block as a call');
});
