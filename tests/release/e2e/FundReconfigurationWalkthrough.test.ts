import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  ComptrollerLib,
  convertRateToScaledPerSecondRate,
  entranceRateFeeConfigArgs,
  FeeManagerActionId,
  feeManagerConfigArgs,
  FundDeployer,
  managementFeeConfigArgs,
  performanceFeeConfigArgs,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  assertNoEvent,
  callOnExtension,
  createNewFund,
  createReconfigurationRequest,
  deployProtocolFixture,
  getAssetUnit,
  ProtocolDeployment,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

const expectedGasCosts = {
  'signal reconfiguration': {
    usdc: 485819,
    weth: 483565,
  },
  'execute reconfiguration': {
    usdc: 436010,
    weth: 405443,
  },
} as const;

describe.each([['weth' as const], ['usdc' as const]])(
  'Walkthrough for %s as denomination asset',
  (denominationAssetId) => {
    let fork: ProtocolDeployment;
    let fundOwner: SignerWithAddress, investor: SignerWithAddress;

    let fundDeployer: FundDeployer;

    let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
    let feeManagerConfig: any;
    let denominationAsset: StandardToken;

    beforeAll(async () => {
      fork = await deployProtocolFixture();

      [fundOwner, investor] = fork.accounts;

      fundDeployer = fork.deployment.fundDeployer;

      denominationAsset =
        denominationAssetId === 'weth'
          ? new StandardToken(fork.config.weth, whales.weth)
          : new StandardToken(fork.config.primitives[denominationAssetId], whales[denominationAssetId]);

      // Create a fund with management and performance fee
      const managementFeeSettings = managementFeeConfigArgs(convertRateToScaledPerSecondRate(utils.parseEther('0.01')));
      const performanceFeeSettings = performanceFeeConfigArgs({
        rate: utils.parseEther('0.1'),
        period: 365 * 24 * 60 * 60,
      });
      const entranceRateFeeSettings = entranceRateFeeConfigArgs(utils.parseEther('0.05'));

      feeManagerConfig = feeManagerConfigArgs({
        fees: [fork.deployment.managementFee, fork.deployment.performanceFee, fork.deployment.entranceRateBurnFee],
        settings: [managementFeeSettings, performanceFeeSettings, entranceRateFeeSettings],
      });

      // Buy shares in the fund for the fund owner
      const createFundTx = await createNewFund({
        signer: fundOwner,
        fundDeployer,
        fundOwner: fundOwner,
        denominationAsset,
        feeManagerConfig,
        investment: {
          buyer: investor,
          seedBuyer: true,
        },
      });

      comptrollerProxy = createFundTx.comptrollerProxy;
      vaultProxy = createFundTx.vaultProxy;

      // Make both fees able to settle by adding free MLN (performance) and warping time (management)
      const mln = new StandardToken(fork.config.primitives.mln, whales.mln);
      const mlnUnit = await getAssetUnit(mln);

      await addNewAssetsToFund({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        assets: [mln],
        amounts: [mlnUnit],
      });
      await provider.send('evm_increaseTime', [60 * 60 * 24 * 30]);

      // Settle fees
      await callOnExtension({
        comptrollerProxy,
        extension: fork.deployment.feeManager,
        actionId: FeeManagerActionId.InvokeContinuousHook,
      });
    });

    it('signals a reconfiguration with the same setup', async () => {
      const { receipt } = await createReconfigurationRequest({
        signer: fundOwner,
        fundDeployer,
        vaultProxy,
        denominationAsset,
        feeManagerConfigData: feeManagerConfig,
      });

      expect(receipt).toCostAround(expectedGasCosts['signal reconfiguration'][denominationAssetId]);
    });

    it('warp beyond reconfiguration timelock and execute the reconfiguration', async () => {
      // Assert that there are still shares outstanding to be paid out
      expect(await vaultProxy.balanceOf(vaultProxy)).toBeGtBigNumber(0);

      const reconfigurationTimelock = await fundDeployer.getReconfigurationTimelock();
      await provider.send('evm_increaseTime', [reconfigurationTimelock.toNumber()]);

      const receipt = await fundDeployer.connect(fundOwner).executeReconfiguration(vaultProxy);

      // Assert that all shares outstanding were paid out
      expect(await vaultProxy.balanceOf(vaultProxy)).toEqBigNumber(0);

      // Assert that DeactivateFeeManagerFailed did not fire
      assertNoEvent(receipt, comptrollerProxy.abi.getEvent('DeactivateFeeManagerFailed'));

      expect(receipt).toCostAround(expectedGasCosts['execute reconfiguration'][denominationAssetId]);
    });

    // TODO: finish this test suite with more stuff as-needed, it fills a specific need for now
    it.todo('more stuff');
  },
);
