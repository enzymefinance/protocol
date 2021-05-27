import {
  claimRewardsSelector,
  curveEursLendArgs,
  curveEursLendAndStakeArgs,
  curveEursRedeemArgs,
  curveEursStakeArgs,
  curveEursUnstakeArgs,
  curveEursUnstakeAndRedeemArgs,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  stakeSelector,
  StandardToken,
  unstakeSelector,
  unstakeAndRedeemSelector,
  ChainlinkRateAsset,
} from '@enzymefinance/protocol';
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
  ProtocolDeployment,
  vaultCallCurveMinterToggleApproveMint,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

const eurUsdAggregator = '0xb49f677943BC038e9857d61E7d053CaA2C1734C1';
let fork: ProtocolDeployment;
let eursUnit: BigNumber;
let sEurUnit: BigNumber;
beforeAll(async () => {
  fork = await deployProtocolFixture();

  const eursToken = new StandardToken(fork.config.unsupportedAssets.eurs, provider);
  eursUnit = utils.parseUnits('1', await eursToken.decimals());
  const sEurToken = new StandardToken(fork.config.synthetix.synths.seur, provider);
  sEurUnit = utils.parseUnits('1', await sEurToken.decimals());
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

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;

    await expect(
      curveLiquidityEursAdapter.parseAssetsForMethod(utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('claimRewards', () => {
    it('generates expected output', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(claimRewardsSelector, constants.HashZero);

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.None,
        spendAssets_: [],
        spendAssetAmounts_: [],
        incomingAssets_: [],
        minIncomingAssetAmounts_: [],
      });
    });
  });

  describe('lend', () => {
    it('generates expected output (eurs only)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingEursAmount = eursUnit.mul(2);
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        lendSelector,
        curveEursLendArgs({
          outgoingEursAmount,
          outgoingSeurAmount: BigNumber.from(0),
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.unsupportedAssets.eurs],
        spendAssetAmounts_: [outgoingEursAmount],
        incomingAssets_: [fork.config.curve.pools.eurs.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (sEUR only)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingSeurAmount = sEurUnit;
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        lendSelector,
        curveEursLendArgs({
          outgoingEursAmount: BigNumber.from(0),
          outgoingSeurAmount,
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.synthetix.synths.seur],
        spendAssetAmounts_: [outgoingSeurAmount],
        incomingAssets_: [fork.config.curve.pools.eurs.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingEursAmount = eursUnit.mul(3);
      const outgoingSeurAmount = sEurUnit.mul(2);
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        lendSelector,
        curveEursLendArgs({
          outgoingEursAmount,
          outgoingSeurAmount,
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.unsupportedAssets.eurs, fork.config.synthetix.synths.seur],
        spendAssetAmounts_: [outgoingEursAmount, outgoingSeurAmount],
        incomingAssets_: [fork.config.curve.pools.eurs.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (eurs only)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingEursAmount = eursUnit.mul(2);
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveEursLendAndStakeArgs({
          outgoingEursAmount,
          outgoingSeurAmount: BigNumber.from(0),
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.unsupportedAssets.eurs],
        spendAssetAmounts_: [outgoingEursAmount],
        incomingAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (sEUR only)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingSeurAmount = sEurUnit.mul(2);
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveEursLendAndStakeArgs({
          outgoingEursAmount: BigNumber.from(0),
          outgoingSeurAmount,
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.synthetix.synths.seur],
        spendAssetAmounts_: [outgoingSeurAmount],
        incomingAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingEursAmount = eursUnit.mul(3);
      const outgoingSeurAmount = sEurUnit.mul(2);
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveEursLendAndStakeArgs({
          outgoingEursAmount,
          outgoingSeurAmount,
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.unsupportedAssets.eurs, fork.config.synthetix.synths.seur],
        spendAssetAmounts_: [outgoingEursAmount, outgoingSeurAmount],
        incomingAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('redeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingEursAmount = eursUnit.mul(3);
      const minIncomingSeurAmount = sEurUnit.mul(2);
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        redeemSelector,
        curveEursRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingEursAmount,
          minIncomingSeurAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.unsupportedAssets.eurs, fork.config.synthetix.synths.seur],
        minIncomingAssetAmounts_: [minIncomingEursAmount, minIncomingSeurAmount],
      });
    });

    it('generates expected output (single-asset: eurs)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingEursAmount = eursUnit.mul(3);
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        redeemSelector,
        curveEursRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingEursAmount,
          minIncomingSeurAmount: BigNumber.from(0),
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.unsupportedAssets.eurs],
        minIncomingAssetAmounts_: [minIncomingEursAmount],
      });
    });

    it('generates expected output (single-asset: sEUR)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingSeurAmount = sEurUnit.mul(3);
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        redeemSelector,
        curveEursRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingEursAmount: BigNumber.from(0),
          minIncomingSeurAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.synthetix.synths.seur],
        minIncomingAssetAmounts_: [minIncomingSeurAmount],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        stakeSelector,
        curveEursStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        unstakeSelector,
        curveEursUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.curve.pools.eurs.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingEursAmount = eursUnit.mul(3);
      const minIncomingSeurAmount = sEurUnit.mul(2);
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveEursUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingEursAmount,
          minIncomingSeurAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.unsupportedAssets.eurs, fork.config.synthetix.synths.seur],
        minIncomingAssetAmounts_: [minIncomingEursAmount, minIncomingSeurAmount],
      });
    });

    it('generates expected output (single-asset: eurs)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingEursAmount = eursUnit.mul(3);
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveEursUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingEursAmount,
          minIncomingSeurAmount: BigNumber.from(0),
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.unsupportedAssets.eurs],
        minIncomingAssetAmounts_: [minIncomingEursAmount],
      });
    });

    it('generates expected output (single-asset: sEUR)', async () => {
      const curveLiquidityEursAdapter = fork.deployment.curveLiquidityEursAdapter;
      const minIncomingSeurAmount = sEurUnit.mul(3);
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityEursAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveEursUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingEursAmount: BigNumber.from(0),
          minIncomingSeurAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityEursAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.eurs.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.synthetix.synths.seur],
        minIncomingAssetAmounts_: [minIncomingSeurAmount],
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Seed fund with a surplus of eurs
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));

    const preTxEursBalance = await eurs.balanceOf(vaultProxy);

    await curveEursLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    const outgoingSeurAmount = sEurUnit.mul(2);

    const preTxSeurBalance = outgoingSeurAmount.mul(2);

    // Seed fund with a surplus of seur
    await seur.transfer(vaultProxy, preTxSeurBalance);

    await curveEursLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount: BigNumber.from(0),
      outgoingSeurAmount,
      minIncomingLPTokenAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount,
      minIncomingLPTokenAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Seed fund with a surplus of eurs
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));

    const preTxEursBalance = await eurs.balanceOf(vaultProxy);

    await curveEursLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
      fundDeployer: fork.deployment.fundDeployer,
    });

    // Seed fund with a surplus of seur
    const outgoingSeurAmount = sEurUnit.mul(2);

    const preTxSeurBalance = outgoingSeurAmount.mul(2);

    // Seed fund with a surplus of seur
    await seur.transfer(vaultProxy, preTxSeurBalance);

    await curveEursLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount: BigNumber.from(0),
      outgoingSeurAmount,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
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
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        curveLiquidityEursAdapter,
        outgoingLPTokenAmount,
        minIncomingEursAmount: BigNumber.from(1),
        minIncomingSeurAmount: BigNumber.from(1),
        receiveSingleAsset: false,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');

    // Add eurs as a supported asset
    await fork.deployment.chainlinkPriceFeed.addPrimitives(
      [fork.config.unsupportedAssets.eurs],
      [eurUsdAggregator],
      [ChainlinkRateAsset.USD],
    );

    // Redeem should now succeed
    await curveEursRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingLPTokenAmount,
      minIncomingEursAmount: BigNumber.from(1),
      minIncomingSeurAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
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
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        curveLiquidityEursAdapter,
        outgoingLPTokenAmount,
        minIncomingEursAmount: BigNumber.from(1),
        minIncomingSeurAmount: BigNumber.from(0),
        receiveSingleAsset: true,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');

    // Add eurs as a supported asset
    await fork.deployment.chainlinkPriceFeed.addPrimitives(
      [fork.config.unsupportedAssets.eurs],
      [eurUsdAggregator],
      [ChainlinkRateAsset.USD],
    );

    // Redeem should now succeed
    await curveEursRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingLPTokenAmount,
      minIncomingEursAmount: BigNumber.from(1),
      minIncomingSeurAmount: BigNumber.from(0),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxEursBalance, preTxSeurBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveEursRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingLPTokenAmount,
      minIncomingEursAmount: BigNumber.from(0),
      minIncomingSeurAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Seed fund with a surplus of eurs and lend and stake for liquidity gauge tokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
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
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        curveLiquidityEursAdapter,
        outgoingLiquidityGaugeTokenAmount,
        minIncomingEursAmount: BigNumber.from(1),
        minIncomingSeurAmount: BigNumber.from(1),
        receiveSingleAsset: false,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');

    // Add eurs as a supported asset
    await fork.deployment.chainlinkPriceFeed.addPrimitives(
      [fork.config.unsupportedAssets.eurs],
      [eurUsdAggregator],
      [ChainlinkRateAsset.USD],
    );

    // Redeem should now succeed
    await curveEursUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingEursAmount: BigNumber.from(1),
      minIncomingSeurAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
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
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        curveLiquidityEursAdapter,
        outgoingLiquidityGaugeTokenAmount,
        minIncomingEursAmount: BigNumber.from(1),
        minIncomingSeurAmount: BigNumber.from(0),
        receiveSingleAsset: true,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');

    // Add eurs as a supported asset
    await fork.deployment.chainlinkPriceFeed.addPrimitives(
      [fork.config.unsupportedAssets.eurs],
      [eurUsdAggregator],
      [ChainlinkRateAsset.USD],
    );

    // Redeem should now succeed
    await curveEursUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingEursAmount: BigNumber.from(1),
      minIncomingSeurAmount: BigNumber.from(0),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Seed fund with a surplus of eurs and lend for lpTokens
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxEursBalance, preTxSeurBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [eurs, seur, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveEursUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingEursAmount: BigNumber.from(0),
      minIncomingSeurAmount: BigNumber.from(1),
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // First, acquire some lpTokens by lending on Curve
    // Seed fund with a surplus of eurs
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount.mul(2));
    await curveEursLend({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveEursStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
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
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
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
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    });

    // Lend and stake to start accruing rewards
    const outgoingEursAmount = eursUnit.mul(2);
    await eurs.transfer(vaultProxy, outgoingEursAmount);
    await curveEursLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
      outgoingEursAmount,
      outgoingSeurAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
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
      comptrollerProxy,
      minter: fork.config.curve.minter,
      account: curveLiquidityEursAdapter,
    });

    // Claim all earned rewards
    await curveEursClaimRewards({
      comptrollerProxy,
      integrationManager: fork.deployment.integrationManager,
      fundOwner,
      curveLiquidityEursAdapter,
    });

    const [postClaimRewardsCrvBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [crv],
    });

    // Assert vault balances of reward tokens have increased
    expect(postClaimRewardsCrvBalance).toBeGtBigNumber(preClaimRewardsCrvBalance);
  });
});
