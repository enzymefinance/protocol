import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, FundDeployer, VaultLib } from '@enzymefinance/protocol';
import {
  convertRateToScaledPerSecondRate,
  entranceRateBurnFeeConfigArgs,
  FeeManagerActionId,
  feeManagerConfigArgs,
  managementFeeConfigArgs,
  performanceFeeConfigArgs,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  addNewAssetsToFund,
  assertNoEvent,
  callOnExtension,
  createNewFund,
  createReconfigurationRequest,
  deployProtocolFixture,
  getAssetUnit,
} from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const FIVE_PERCENT = BigNumber.from(500);
const TEN_PERCENT = BigNumber.from(1000);

const expectedGasCosts = {
  'execute reconfiguration': {
    usdc: 352203,
    weth: 319784,
  },
  'signal reconfiguration': {
    usdc: 556834,
    weth: 554576,
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
      const managementFeeSettings = managementFeeConfigArgs({
        scaledPerSecondRate: convertRateToScaledPerSecondRate(utils.parseEther('0.01')),
      });
      const performanceFeeSettings = performanceFeeConfigArgs({
        rate: TEN_PERCENT,
      });
      const entranceRateBurnFeeSettings = entranceRateBurnFeeConfigArgs({ rate: FIVE_PERCENT });

      feeManagerConfig = feeManagerConfigArgs({
        fees: [fork.deployment.managementFee, fork.deployment.performanceFee, fork.deployment.entranceRateBurnFee],
        settings: [managementFeeSettings, performanceFeeSettings, entranceRateBurnFeeSettings],
      });

      // Buy shares in the fund for the fund owner
      const createFundTx = await createNewFund({
        denominationAsset,
        feeManagerConfig,
        fundDeployer,
        fundOwner,
        investment: {
          buyer: investor,
          seedBuyer: true,
        },
        signer: fundOwner,
      });

      comptrollerProxy = createFundTx.comptrollerProxy;
      vaultProxy = createFundTx.vaultProxy;

      // Make both fees able to settle by adding free MLN (performance) and warping time (management)
      const mln = new StandardToken(fork.config.primitives.mln, whales.mln);
      const mlnUnit = await getAssetUnit(mln);

      await addNewAssetsToFund({
        amounts: [mlnUnit],
        assets: [mln],
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        signer: fundOwner,
      });
      await provider.send('evm_increaseTime', [60 * 60 * 24 * 30]);

      // Settle fees
      await callOnExtension({
        actionId: FeeManagerActionId.InvokeContinuousHook,
        comptrollerProxy,
        extension: fork.deployment.feeManager,
      });
    });

    it('signals a reconfiguration with the same setup', async () => {
      const { receipt } = await createReconfigurationRequest({
        denominationAsset,
        feeManagerConfigData: feeManagerConfig,
        fundDeployer,
        signer: fundOwner,
        vaultProxy,
      });

      expect(receipt).toCostAround(expectedGasCosts['signal reconfiguration'][denominationAssetId]);
    });

    // TODO: there are currently no fees that use "shares outstanding," otherwise we should test they are paid out
    it('warp beyond reconfiguration timelock and execute the reconfiguration', async () => {
      const reconfigurationTimelock = await fundDeployer.getReconfigurationTimelock();
      await provider.send('evm_increaseTime', [reconfigurationTimelock.toNumber()]);

      const receipt = await fundDeployer.connect(fundOwner).executeReconfiguration(vaultProxy);

      // Assert that DeactivateFeeManagerFailed did not fire
      assertNoEvent(receipt, comptrollerProxy.abi.getEvent('DeactivateFeeManagerFailed'));

      expect(receipt).toCostAround(expectedGasCosts['execute reconfiguration'][denominationAssetId]);
    });

    // TODO: finish this test suite with more stuff as-needed, it fills a specific need for now
    it.todo('more stuff');
  },
);
