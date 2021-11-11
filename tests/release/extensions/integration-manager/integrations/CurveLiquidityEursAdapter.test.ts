import { randomAddress } from '@enzymefinance/ethers';
import {
  ChainlinkRateAsset,
  claimRewardsSelector,
  curveEursLendAndStakeArgs,
  curveEursLendArgs,
  curveEursRedeemArgs,
  curveEursStakeArgs,
  curveEursUnstakeAndRedeemArgs,
  curveEursUnstakeArgs,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  stakeSelector,
  StandardToken,
  unstakeAndRedeemSelector,
  unstakeSelector,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  curveEursClaimRewards,
  curveEursLend,
  curveEursLendAndStake,
  curveEursRedeem,
  curveEursStake,
  curveEursUnstake,
  curveEursUnstakeAndRedeem,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

const eurUsdAggregator = '0xb49f677943BC038e9857d61E7d053CaA2C1734C1';
let fork: ProtocolDeployment;
let eursUnit: BigNumber;
let sEurUnit: BigNumber;
beforeAll(async () => {
  fork = await deployProtocolFixture();

  eursUnit = await getAssetUnit(new StandardToken(fork.config.unsupportedAssets.eurs, provider));
  sEurUnit = await getAssetUnit(new StandardToken(fork.config.synthetix.synths.seur, provider));
});

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;

    expect(await curveLiquidityEursAdapter.getLpToken()).toMatchAddress(fork.config.curve.pools.eurs.lpToken);
    expect(await curveLiquidityEursAdapter.getLiquidityGaugeToken()).toMatchAddress(
      fork.config.curve.pools.eurs.liquidityGaugeToken,
    );
    expect(await curveLiquidityEursAdapter.getEursToken()).toMatchAddress(fork.config.unsupportedAssets.eurs);
    expect(await curveLiquidityEursAdapter.getSeurToken()).toMatchAddress(fork.config.synthetix.synths.seur);

    // AdapterBase
    expect(await curveLiquidityEursAdapter.getIntegrationManager()).toMatchAddress(fork.deployment.integrationManager);

    // CurveGaugeV2RewardsHandlerBase
    expect(await curveLiquidityEursAdapter.getCurveGaugeV2RewardsHandlerCrvToken()).toMatchAddress(
      fork.config.primitives.crv,
    );
    expect(await curveLiquidityEursAdapter.getCurveGaugeV2RewardsHandlerMinter()).toMatchAddress(
      fork.config.curve.minter,
    );

    // CurveEursLiquidityActionsMixin
    expect(await curveLiquidityEursAdapter.getCurveEursLiquidityPool()).toMatchAddress(
      fork.config.curve.pools.eurs.pool,
    );
  });
});

describe('parseAssetsForAction', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;

    await expect(
      curveLiquidityEursAdapter.parseAssetsForAction(randomAddress(), utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('claimRewards', () => {
    it('generates expected output', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        claimRewardsSelector,
        constants.HashZero,
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
        spendAssetAmounts_: [],
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
      });
    });
  });

  describe('lend', () => {
    it('generates expected output (eurs only)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingEursAmount = eursUnit.mul(2);
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveEursLendArgs({
          minIncomingLPTokenAmount,
          outgoingEursAmount,
          outgoingSeurAmount: BigNumber.from(0),
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.eurs.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingEursAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.unsupportedAssets.eurs],
      });
    });

    it('generates expected output (sEUR only)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingSeurAmount = sEurUnit;
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveEursLendArgs({
          minIncomingLPTokenAmount,
          outgoingEursAmount: BigNumber.from(0),
          outgoingSeurAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.eurs.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingSeurAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.synthetix.synths.seur],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingEursAmount = eursUnit.mul(3);
      const outgoingSeurAmount = sEurUnit.mul(2);
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        lendSelector,
        curveEursLendArgs({
          minIncomingLPTokenAmount,
          outgoingEursAmount,
          outgoingSeurAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.eurs.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
        spendAssetAmounts_: [outgoingEursAmount, outgoingSeurAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.unsupportedAssets.eurs, fork.config.synthetix.synths.seur],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (eurs only)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingEursAmount = eursUnit.mul(2);
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveEursLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingEursAmount,
          outgoingSeurAmount: BigNumber.from(0),
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingEursAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.unsupportedAssets.eurs],
      });
    });

    it('generates expected output (sEUR only)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingSeurAmount = sEurUnit.mul(2);
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveEursLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingEursAmount: BigNumber.from(0),
          outgoingSeurAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingSeurAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.synthetix.synths.seur],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingEursAmount = eursUnit.mul(3);
      const outgoingSeurAmount = sEurUnit.mul(2);
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        lendAndStakeSelector,
        curveEursLendAndStakeArgs({
          minIncomingLiquidityGaugeTokenAmount,
          outgoingEursAmount,
          outgoingSeurAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingEursAmount, outgoingSeurAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.unsupportedAssets.eurs, fork.config.synthetix.synths.seur],
      });
    });
  });

  describe('redeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingEursAmount = eursUnit.mul(3);
      const minIncomingSeurAmount = sEurUnit.mul(2);
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveEursRedeemArgs({
          minIncomingEursAmount,
          minIncomingSeurAmount,
          outgoingLPTokenAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.unsupportedAssets.eurs, fork.config.synthetix.synths.seur],
        minIncomingAssetAmounts_: [minIncomingEursAmount, minIncomingSeurAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.lpToken],
      });
    });

    it('generates expected output (single-asset: eurs)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingEursAmount = eursUnit.mul(3);
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveEursRedeemArgs({
          minIncomingEursAmount,
          minIncomingSeurAmount: BigNumber.from(0),
          outgoingLPTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.unsupportedAssets.eurs],
        minIncomingAssetAmounts_: [minIncomingEursAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.lpToken],
      });
    });

    it('generates expected output (single-asset: sEUR)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingSeurAmount = sEurUnit.mul(3);
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        redeemSelector,
        curveEursRedeemArgs({
          minIncomingEursAmount: BigNumber.from(0),
          minIncomingSeurAmount,
          outgoingLPTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.synthetix.synths.seur],
        minIncomingAssetAmounts_: [minIncomingSeurAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.lpToken],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        stakeSelector,
        curveEursStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.lpToken],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeSelector,
        curveEursUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.curve.pools.eurs.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingEursAmount = eursUnit.mul(3);
      const minIncomingSeurAmount = sEurUnit.mul(2);
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveEursUnstakeAndRedeemArgs({
          minIncomingEursAmount,
          minIncomingSeurAmount,
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.unsupportedAssets.eurs, fork.config.synthetix.synths.seur],
        minIncomingAssetAmounts_: [minIncomingEursAmount, minIncomingSeurAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
      });
    });

    it('generates expected output (single-asset: eurs)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingEursAmount = eursUnit.mul(3);
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveEursUnstakeAndRedeemArgs({
          minIncomingEursAmount,
          minIncomingSeurAmount: BigNumber.from(0),
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.unsupportedAssets.eurs],
        minIncomingAssetAmounts_: [minIncomingEursAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
      });
    });

    it('generates expected output (single-asset: sEUR)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingSeurAmount = sEurUnit.mul(3);
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForAction(
        randomAddress(),
        unstakeAndRedeemSelector,
        curveEursUnstakeAndRedeemArgs({
          minIncomingEursAmount: BigNumber.from(0),
          minIncomingSeurAmount,
          outgoingLiquidityGaugeTokenAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForAction, {
        incomingAssets_: [fork.config.synthetix.synths.seur],
        minIncomingAssetAmounts_: [minIncomingSeurAmount],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
      });
    });
  });
});

describe('lend', () => {
  it('works as expected (with only eurs)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const lpToken = new StandardToken(fork.config.curve.pools.eurs.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));

    const preTxEursBalance = await eurs.balanceOf(vaultProxy);

    await curveEursLend({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    const [postTxEursBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxEursBalance).toEqBigNumber(preTxEursBalance.sub(outgoingEursAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with only seur)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, whales.seur);
    const lpToken = new StandardToken(fork.config.curve.pools.eurs.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const outgoingSeurAmount = sEurUnit.mul(2);

    const preTxSeurBalance = outgoingSeurAmount.mul(2);

    // Seed fund with a surplus of seur
    await seur.transfer(vaultProxy, preTxSeurBalance);

    await curveEursLend({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingEursAmount: BigNumber.from(0),
      outgoingSeurAmount,
    });

    const [postTxSeurBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [seur, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxSeurBalance).toEqBigNumber(preTxSeurBalance.sub(outgoingSeurAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with an imbalance of eurs and seur)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const seur = new StandardToken(fork.config.synthetix.synths.seur, whales.seur);
    const lpToken = new StandardToken(fork.config.curve.pools.eurs.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const outgoingEursAmount = eursUnit.mul(3);
    const outgoingSeurAmount = sEurUnit.mul(2);

    const preTxEursBalance = outgoingEursAmount.mul(2);
    const preTxSeurBalance = outgoingSeurAmount.mul(2);

    // Seed fund with a surplus of eurs and seur
    await eurs.transfer(vaultProxy, preTxEursBalance);
    await seur.transfer(vaultProxy, preTxSeurBalance);

    await curveEursLend({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount,
    });

    const [postTxEursBalance, postTxSeurBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxEursBalance).toEqBigNumber(preTxEursBalance.sub(outgoingEursAmount));
    expect(postTxSeurBalance).toEqBigNumber(preTxSeurBalance.sub(outgoingSeurAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });
});

describe('lendAndStake', () => {
  it('works as expected (with only eurs)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.eurs.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));

    const preTxEursBalance = await eurs.balanceOf(vaultProxy);

    await curveEursLendAndStake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    const [postTxEursBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, liquidityGaugeToken],
    });

    // Assert the amounts of spent and received
    expect(postTxEursBalance).toEqBigNumber(preTxEursBalance.sub(outgoingEursAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with only seur)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, whales.seur);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.eurs.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of seur
    const outgoingSeurAmount = sEurUnit.mul(2);

    const preTxSeurBalance = outgoingSeurAmount.mul(2);

    // Seed fund with a surplus of seur
    await seur.transfer(vaultProxy, preTxSeurBalance);

    await curveEursLendAndStake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingEursAmount: BigNumber.from(0),
      outgoingSeurAmount,
    });

    const [postTxSeurBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [seur, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxSeurBalance).toEqBigNumber(preTxSeurBalance.sub(outgoingSeurAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with an imbalance of eurs and seur)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, whales.seur);
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.eurs.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs and seur
    const outgoingEursAmount = eursUnit.mul(3);
    const outgoingSeurAmount = sEurUnit.mul(2);

    const preTxEursBalance = outgoingEursAmount.mul(2);
    const preTxSeurBalance = outgoingSeurAmount.mul(2);

    // Seed fund with a surplus of eurs and seur
    await eurs.transfer(vaultProxy, preTxEursBalance);
    await seur.transfer(vaultProxy, preTxSeurBalance);

    await curveEursLendAndStake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount,
    });

    const [postTxEursBalance, postTxSeurBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxEursBalance).toEqBigNumber(preTxEursBalance.sub(outgoingEursAmount));
    expect(postTxSeurBalance).toEqBigNumber(preTxSeurBalance.sub(outgoingSeurAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });
});

describe('redeem', () => {
  it('works as expected (standard)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, provider);
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const lpToken = new StandardToken(fork.config.curve.pools.eurs.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLend({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    const [preTxEursBalance, preTxSeurBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    // Redeem should fail while EURS is not a supported asset
    await expect(
      curveEursRedeem({
        comptrollerProxy,
        curveLiquidityEursAdapter,
        fundOwner,
        integrationManager: fork.deployment.integrationManager,
        minIncomingEursAmount: BigNumber.from(1),
        minIncomingSeurAmount: BigNumber.from(1),
        outgoingLPTokenAmount,
        receiveSingleAsset: false,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');

    // Add eurs as a supported asset
    await fork.deployment.valueInterpreter.addPrimitives(
      [fork.config.unsupportedAssets.eurs],
      [eurUsdAggregator],
      [ChainlinkRateAsset.USD],
    );

    // Redeem should now succeed
    await curveEursRedeem({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingEursAmount: BigNumber.from(1),
      minIncomingSeurAmount: BigNumber.from(1),
      outgoingLPTokenAmount,
      receiveSingleAsset: false,
    });

    const [postTxEursBalance, postTxSeurBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxEursBalance).toBeGtBigNumber(preTxEursBalance);
    expect(postTxSeurBalance).toBeGtBigNumber(preTxSeurBalance);
  });

  it('works as expected (single-asset: eurs)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, provider);
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const lpToken = new StandardToken(fork.config.curve.pools.eurs.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLend({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    const [preTxEursBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    // Redeem should fail while EURS is not a supported asset
    await expect(
      curveEursRedeem({
        comptrollerProxy,
        curveLiquidityEursAdapter,
        fundOwner,
        integrationManager: fork.deployment.integrationManager,
        minIncomingEursAmount: BigNumber.from(1),
        minIncomingSeurAmount: BigNumber.from(0),
        outgoingLPTokenAmount,
        receiveSingleAsset: true,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');

    // Add eurs as a supported asset
    await fork.deployment.valueInterpreter.addPrimitives(
      [fork.config.unsupportedAssets.eurs],
      [eurUsdAggregator],
      [ChainlinkRateAsset.USD],
    );

    // Redeem should now succeed
    await curveEursRedeem({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingEursAmount: BigNumber.from(1),
      minIncomingSeurAmount: BigNumber.from(0),
      outgoingLPTokenAmount,
      receiveSingleAsset: true,
    });

    const [postTxEursBalance, postTxSeurBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxEursBalance).toBeGtBigNumber(preTxEursBalance);
    // sEUR balance should be unchanged
    expect(postTxSeurBalance).toEqBigNumber(0);
  });

  it('works as expected (single-asset: seur)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, provider);
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const lpToken = new StandardToken(fork.config.curve.pools.eurs.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLend({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    const [preTxEursBalance, preTxSeurBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveEursRedeem({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingEursAmount: BigNumber.from(0),
      minIncomingSeurAmount: BigNumber.from(1),
      outgoingLPTokenAmount,
      receiveSingleAsset: true,
    });

    const [postTxEursBalance, postTxSeurBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxSeurBalance).toBeGtBigNumber(preTxSeurBalance);
    // EURS balance should be unchanged
    expect(postTxEursBalance).toEqBigNumber(preTxEursBalance);
  });
});

describe('unstakeAndRedeem', () => {
  it('works as expected (standard)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, provider);
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.eurs.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs and lend and stake for liquidity gauge tokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLendAndStake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    const [preTxEursBalance, preTxSeurBalance, preTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLiquidityGaugeTokenBalance.div(2);

    // Redeem should fail while EURS is not a supported asset
    await expect(
      curveEursUnstakeAndRedeem({
        comptrollerProxy,
        curveLiquidityEursAdapter,
        fundOwner,
        integrationManager: fork.deployment.integrationManager,
        minIncomingEursAmount: BigNumber.from(1),
        minIncomingSeurAmount: BigNumber.from(1),
        outgoingLiquidityGaugeTokenAmount,
        receiveSingleAsset: false,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');

    // Add eurs as a supported asset
    await fork.deployment.valueInterpreter.addPrimitives(
      [fork.config.unsupportedAssets.eurs],
      [eurUsdAggregator],
      [ChainlinkRateAsset.USD],
    );

    // Redeem should now succeed
    await curveEursUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingEursAmount: BigNumber.from(1),
      minIncomingSeurAmount: BigNumber.from(1),
      outgoingLiquidityGaugeTokenAmount,
      receiveSingleAsset: false,
    });

    const [postTxEursBalance, postTxSeurBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLiquidityGaugeTokenBalance).toEqBigNumber(
      preTxLiquidityGaugeTokenBalance.sub(outgoingLiquidityGaugeTokenAmount),
    );
    // TODO: get expected incoming amounts
    expect(postTxEursBalance).toBeGtBigNumber(preTxEursBalance);
    expect(postTxSeurBalance).toBeGtBigNumber(preTxSeurBalance);
  });

  it('works as expected (single-asset: eurs)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, provider);
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.eurs.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLendAndStake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    const [preTxEursBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    // Redeem should fail while EURS is not a supported asset
    await expect(
      curveEursUnstakeAndRedeem({
        comptrollerProxy,
        curveLiquidityEursAdapter,
        fundOwner,
        integrationManager: fork.deployment.integrationManager,
        minIncomingEursAmount: BigNumber.from(1),
        minIncomingSeurAmount: BigNumber.from(0),
        outgoingLiquidityGaugeTokenAmount,
        receiveSingleAsset: true,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');

    // Add eurs as a supported asset
    await fork.deployment.valueInterpreter.addPrimitives(
      [fork.config.unsupportedAssets.eurs],
      [eurUsdAggregator],
      [ChainlinkRateAsset.USD],
    );

    // Redeem should now succeed
    await curveEursUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingEursAmount: BigNumber.from(1),
      minIncomingSeurAmount: BigNumber.from(0),
      outgoingLiquidityGaugeTokenAmount,
      receiveSingleAsset: true,
    });

    const [postTxEursBalance, postTxSeurBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLiquidityGaugeTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxEursBalance).toBeGtBigNumber(preTxEursBalance);
    // sEUR balance should be unchanged
    expect(postTxSeurBalance).toEqBigNumber(0);
  });

  it('works as expected (single-asset: seur)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const seur = new StandardToken(fork.config.synthetix.synths.seur, provider);
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.eurs.liquidityGaugeToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLendAndStake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    const [preTxEursBalance, preTxSeurBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveEursUnstakeAndRedeem({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingEursAmount: BigNumber.from(0),
      minIncomingSeurAmount: BigNumber.from(1),
      outgoingLiquidityGaugeTokenAmount,
      receiveSingleAsset: true,
    });

    const [postTxEursBalance, postTxSeurBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLiquidityGaugeTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxSeurBalance).toBeGtBigNumber(preTxSeurBalance);
    // EURS balance should be unchanged
    expect(postTxEursBalance).toEqBigNumber(preTxEursBalance);
  });
});

describe('stake and unstake', () => {
  it('correctly handles staking and then unstaking partial balances', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);
    const liquidityGaugeToken = new StandardToken(fork.config.curve.pools.eurs.liquidityGaugeToken, provider);
    const lpToken = new StandardToken(fork.config.curve.pools.eurs.lpToken, provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // First, acquire some lpTokens by lending on Curve
    // Seed fund with a surplus of eurs
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLend({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLPTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveEursStake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingLPTokenAmount: stakeLPTokenAmount,
    });

    const [postStakeTxLpTokenBalance, postStakeTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [lpToken, liquidityGaugeToken],
    });

    // Assert the amounts spent and received in staking
    expect(postStakeTxLpTokenBalance).toEqBigNumber(preStakeTxLpTokenBalance.sub(stakeLPTokenAmount));
    expect(postStakeTxLiquidityGaugeTokenBalance).toEqBigNumber(stakeLPTokenAmount);

    // Unstake half of the tokens
    const unstakeLiquidityGaugeTokenAmount = stakeLPTokenAmount.div(2);
    await curveEursUnstake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      outgoingLiquidityGaugeTokenAmount: unstakeLiquidityGaugeTokenAmount,
    });

    const [postUnstakeTxLpTokenBalance, postUnstakeTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [lpToken, liquidityGaugeToken],
    });

    // Assert the amounts spent and received in unstaking
    expect(postUnstakeTxLpTokenBalance).toEqBigNumber(postStakeTxLpTokenBalance.add(unstakeLiquidityGaugeTokenAmount));
    expect(postUnstakeTxLiquidityGaugeTokenBalance).toEqBigNumber(
      postStakeTxLiquidityGaugeTokenBalance.sub(unstakeLiquidityGaugeTokenAmount),
    );
  });
});

describe('claimRewards', () => {
  it('claims CRV and pool token rewards, which land in the vault', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
    const crv = new StandardToken(fork.config.primitives.crv, provider);
    const eurs = new StandardToken(fork.config.unsupportedAssets.eurs, whales.eurs);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Lend and stake to start accruing rewards
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount);
    await curveEursLendAndStake({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
    });

    // TODO: check if call fails if no rewards available

    // Warp ahead in time to accrue rewards
    await provider.send('evm_increaseTime', [86400]);

    const [preClaimRewardsCrvBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv],
    });

    // Approve the adapter to claim $CRV rewards on behalf of the vault
    await vaultCallCurveMinterToggleApproveMint({
      account: curveLiquidityEursAdapter,
      comptrollerProxy,
      minter: fork.config.curve.minter,
    });

    // Claim all earned rewards
    await curveEursClaimRewards({
      comptrollerProxy,
      curveLiquidityEursAdapter,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
    });

    const [postClaimRewardsCrvBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv],
    });

    // Assert vault balances of reward tokens have increased
    expect(postClaimRewardsCrvBalance).toBeGtBigNumber(preClaimRewardsCrvBalance);
  });
});
