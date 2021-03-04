import { SignerWithAddress } from '@crestproject/crestproject';
import {
  curveStethLendArgs,
  curveStethLendAndStakeArgs,
  curveStethRedeemArgs,
  curveStethStakeArgs,
  curveStethUnstakeArgs,
  curveStethUnstakeAndRedeemArgs,
  lendAndStakeSelector,
  lendSelector,
  redeemSelector,
  SpendAssetsHandleType,
  stakeSelector,
  StandardToken,
  unstakeSelector,
  unstakeAndRedeemSelector,
} from '@enzymefinance/protocol';
import {
  createNewFund,
  CurveLiquidityGaugeV2,
  CurveMinter,
  curveMinterMint,
  curveMinterMintMany,
  curveMinterToggleApproveMint,
  curveStethLend,
  curveStethLendAndStake,
  curveStethRedeem,
  curveStethStake,
  curveStethUnstake,
  curveStethUnstakeAndRedeem,
  ForkDeployment,
  getAssetBalances,
  loadForkDeployment,
  mainnetWhales,
  unlockWhales,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';
import hre from 'hardhat';

let fork: ForkDeployment;
const whales: Record<string, SignerWithAddress> = {};

beforeAll(async () => {
  // Assign signers for whale accounts any) as SignerWithAddress;
  whales.weth = ((await hre.ethers.getSigner(mainnetWhales.weth)) as any) as SignerWithAddress;
  whales.steth = ((await hre.ethers.getSigner(mainnetWhales.lidoSteth)) as any) as SignerWithAddress;

  await unlockWhales({
    provider: hre.ethers.provider,
    whales: Object.values(whales),
  });
});

beforeEach(async () => {
  fork = await loadForkDeployment();
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;

    const getIntegrationManagerCall = await curveLiquidityStethAdapter.getIntegrationManager();
    expect(getIntegrationManagerCall).toMatchAddress(fork.deployment.IntegrationManager);

    const getLPTokenCall = await curveLiquidityStethAdapter.getLPToken();
    expect(getLPTokenCall).toMatchAddress(fork.config.curve.pools.steth.lpToken);

    const getLiquidityGaugeTokenCall = await curveLiquidityStethAdapter.getLiquidityGaugeToken();
    expect(getLiquidityGaugeTokenCall).toMatchAddress(fork.config.curve.pools.steth.liquidityGaugeToken);

    const getPoolCall = await curveLiquidityStethAdapter.getPool();
    expect(getPoolCall).toMatchAddress(fork.config.curve.pools.steth.pool);

    const getStethTokenCall = await curveLiquidityStethAdapter.getStethToken();
    expect(getStethTokenCall).toMatchAddress(fork.config.lido.steth);

    const getWethTokenCall = await curveLiquidityStethAdapter.getWethToken();
    expect(getWethTokenCall).toMatchAddress(fork.config.weth);
  });
});

describe('parseAssetsForMethod', () => {
  it('does not allow a bad selector', async () => {
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;

    await expect(
      curveLiquidityStethAdapter.parseAssetsForMethod(utils.randomBytes(4), constants.HashZero),
    ).rejects.toBeRevertedWith('_selector invalid');
  });

  describe('lend', () => {
    it('generates expected output (weth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendSelector,
        curveStethLendArgs({
          outgoingWethAmount,
          outgoingStethAmount: BigNumber.from(0),
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
        spendAssetAmounts_: [outgoingWethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (steth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendSelector,
        curveStethLendArgs({
          outgoingWethAmount: BigNumber.from(0),
          outgoingStethAmount,
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.lido.steth],
        spendAssetAmounts_: [outgoingStethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendSelector,
        curveStethLendArgs({
          outgoingWethAmount,
          outgoingStethAmount,
          minIncomingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, fork.config.lido.steth],
        spendAssetAmounts_: [outgoingWethAmount, outgoingStethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [minIncomingLPTokenAmount],
      });
    });
  });

  describe('lendAndStake', () => {
    it('generates expected output (weth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          outgoingWethAmount,
          outgoingStethAmount: BigNumber.from(0),
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth],
        spendAssetAmounts_: [outgoingWethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (steth only)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          outgoingWethAmount: BigNumber.from(0),
          outgoingStethAmount,
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.lido.steth],
        spendAssetAmounts_: [outgoingStethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });

    it('generates expected output (both assets)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const outgoingWethAmount = utils.parseEther('3');
      const outgoingStethAmount = utils.parseEther('2');
      const minIncomingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        lendAndStakeSelector,
        curveStethLendAndStakeArgs({
          outgoingWethAmount,
          outgoingStethAmount,
          minIncomingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.weth, fork.config.lido.steth],
        spendAssetAmounts_: [outgoingWethAmount, outgoingStethAmount],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [minIncomingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('redeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingStethAmount = utils.parseEther('2');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveStethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount,
          minIncomingStethAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.weth, fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingStethAmount],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveStethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount,
          minIncomingStethAmount: BigNumber.from(0),
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
      });
    });

    it('generates expected output (single-asset: steth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const minIncomingStethAmount = utils.parseEther('3');
      const outgoingLPTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        redeemSelector,
        curveStethRedeemArgs({
          outgoingLPTokenAmount,
          minIncomingWethAmount: BigNumber.from(0),
          minIncomingStethAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingStethAmount],
      });
    });
  });

  describe('stake', () => {
    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const outgoingLPTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        stakeSelector,
        curveStethStakeArgs({
          outgoingLPTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.lpToken],
        spendAssetAmounts_: [outgoingLPTokenAmount],
        incomingAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        minIncomingAssetAmounts_: [outgoingLPTokenAmount],
      });
    });
  });

  describe('unstake', () => {
    it('generates expected output', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('2');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        unstakeSelector,
        curveStethUnstakeArgs({
          outgoingLiquidityGaugeTokenAmount,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.curve.pools.steth.lpToken],
        minIncomingAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
      });
    });
  });

  describe('unstakeAndRedeem', () => {
    it('generates expected output (standard)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const minIncomingStethAmount = utils.parseEther('2');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount,
          minIncomingStethAmount,
          receiveSingleAsset: false,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.weth, fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingWethAmount, minIncomingStethAmount],
      });
    });

    it('generates expected output (single-asset: weth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const minIncomingWethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount,
          minIncomingStethAmount: BigNumber.from(0),
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.weth],
        minIncomingAssetAmounts_: [minIncomingWethAmount],
      });
    });

    it('generates expected output (single-asset: steth)', async () => {
      const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
      const minIncomingStethAmount = utils.parseEther('3');
      const outgoingLiquidityGaugeTokenAmount = utils.parseEther('1');

      const result = await curveLiquidityStethAdapter.parseAssetsForMethod(
        unstakeAndRedeemSelector,
        curveStethUnstakeAndRedeemArgs({
          outgoingLiquidityGaugeTokenAmount,
          minIncomingWethAmount: BigNumber.from(0),
          minIncomingStethAmount,
          receiveSingleAsset: true,
        }),
      );

      expect(result).toMatchFunctionOutput(curveLiquidityStethAdapter.parseAssetsForMethod, {
        spendAssetsHandleType_: SpendAssetsHandleType.Transfer,
        spendAssets_: [fork.config.curve.pools.steth.liquidityGaugeToken],
        spendAssetAmounts_: [outgoingLiquidityGaugeTokenAmount],
        incomingAssets_: [fork.config.lido.steth],
        minIncomingAssetAmounts_: [minIncomingStethAmount],
      });
    });
  });
});

describe('lend', () => {
  it('works as expected (with only weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));

    const preTxWethBalance = await weth.balanceOf(vaultProxy);

    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with only steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, whales.steth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
    });

    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of steth
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount: BigNumber.from(0),
      outgoingStethAmount,
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxStethBalance).toEqBigNumber(preTxStethBalance.sub(outgoingStethAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with an imbalance of weth and steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const steth = new StandardToken(fork.config.lido.steth, whales.steth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    const outgoingWethAmount = utils.parseEther('0.5');
    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxWethBalance = outgoingWethAmount.mul(2);
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of weth and steth
    await weth.transfer(vaultProxy, preTxWethBalance);
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount,
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    expect(postTxStethBalance).toEqBigNumber(preTxStethBalance.sub(outgoingStethAmount));
    // TODO: get expected incoming amount
    expect(postTxLpTokenBalance).toBeGtBigNumber(0);
  });
});

describe('lendAndStake', () => {
  it('works as expected (with only weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(
      fork.config.curve.pools.steth.liquidityGaugeToken,
      hre.ethers.provider,
    );

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));

    const preTxWethBalance = await weth.balanceOf(vaultProxy);

    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, liquidityGaugeToken],
    });

    // Assert the amounts of spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with only steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, whales.steth);
    const liquidityGaugeToken = new StandardToken(
      fork.config.curve.pools.steth.liquidityGaugeToken,
      hre.ethers.provider,
    );

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: new StandardToken(fork.config.weth, hre.ethers.provider),
    });

    // Seed fund with a surplus of steth
    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of steth
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount: BigNumber.from(0),
      outgoingStethAmount,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [postTxStethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxStethBalance).toEqBigNumber(preTxStethBalance.sub(outgoingStethAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });

  it('works as expected (with an imbalance of weth and steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, whales.steth);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(
      fork.config.curve.pools.steth.liquidityGaugeToken,
      hre.ethers.provider,
    );

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and steth
    const outgoingWethAmount = utils.parseEther('3');
    const outgoingStethAmount = utils.parseEther('2');

    // TODO: the test runner has some weird behavior where the stETH balance here
    // is reporting 1 wei less than it should be, if queried directly
    const preTxWethBalance = outgoingWethAmount.mul(2);
    const preTxStethBalance = outgoingStethAmount.mul(2);

    // Seed fund with a surplus of weth and steth
    await weth.transfer(vaultProxy, preTxWethBalance);
    await steth.transfer(vaultProxy, preTxStethBalance);

    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount,
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [postTxWethBalance, postTxStethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance.sub(outgoingWethAmount));
    expect(postTxStethBalance).toEqBigNumber(preTxStethBalance.sub(outgoingStethAmount));
    // TODO: get expected incoming amount
    expect(postTxLiquidityGaugeTokenBalance).toBeGtBigNumber(0);
  });
});

describe('redeem', () => {
  it('works as expected (standard)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, hre.ethers.provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingStethAmount: BigNumber.from(1),
      receiveSingleAsset: false,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
  });

  it('works as expected (single-asset: weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, hre.ethers.provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingStethAmount: BigNumber.from(0),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    // STETH balance should be unchanged
    expect(postTxStethBalance).toEqBigNumber(0);
  });

  it('works as expected (single-asset: steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, hre.ethers.provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    const outgoingLPTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLPTokenAmount,
      minIncomingWethAmount: BigNumber.from(0),
      minIncomingStethAmount: BigNumber.from(1),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, lpToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLPTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
    // WETH balance should be unchanged
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance);
  });
});

describe('unstakeAndRedeem', () => {
  it('works as expected (standard)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, hre.ethers.provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(
      fork.config.curve.pools.steth.liquidityGaugeToken,
      hre.ethers.provider,
    );

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend and stake for liquidity gauge tokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxStethBalance, preTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLiquidityGaugeTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingStethAmount: BigNumber.from(1),
      receiveSingleAsset: false,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLiquidityGaugeTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLiquidityGaugeTokenBalance).toEqBigNumber(
      preTxLiquidityGaugeTokenBalance.sub(outgoingLiquidityGaugeTokenAmount),
    );
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
  });

  it('works as expected (single-asset: weth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, hre.ethers.provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(
      fork.config.curve.pools.steth.liquidityGaugeToken,
      hre.ethers.provider,
    );

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(1),
      minIncomingStethAmount: BigNumber.from(0),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLiquidityGaugeTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxWethBalance).toBeGtBigNumber(preTxWethBalance);
    // STETH balance should be unchanged
    expect(postTxStethBalance).toEqBigNumber(0);
  });

  it('works as expected (single-asset: steth)', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const steth = new StandardToken(fork.config.lido.steth, hre.ethers.provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(
      fork.config.curve.pools.steth.liquidityGaugeToken,
      hre.ethers.provider,
    );

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Seed fund with a surplus of weth and lend for lpTokens
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    const [preTxWethBalance, preTxStethBalance, preTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    const outgoingLiquidityGaugeTokenAmount = preTxLpTokenBalance.div(2);

    await curveStethUnstakeAndRedeem({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingLiquidityGaugeTokenAmount,
      minIncomingWethAmount: BigNumber.from(0),
      minIncomingStethAmount: BigNumber.from(1),
      receiveSingleAsset: true,
    });

    const [postTxWethBalance, postTxStethBalance, postTxLpTokenBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [weth, steth, liquidityGaugeToken],
    });

    // Assert the amounts spent and received
    expect(postTxLpTokenBalance).toEqBigNumber(preTxLpTokenBalance.sub(outgoingLiquidityGaugeTokenAmount));
    // TODO: get expected incoming amounts
    expect(postTxStethBalance).toBeGtBigNumber(preTxStethBalance);
    // WETH balance should be unchanged
    expect(postTxWethBalance).toEqBigNumber(preTxWethBalance);
  });
});

describe('stake and unstake', () => {
  it('correctly handles staking and then unstaking partial balances', async () => {
    const [fundOwner] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const liquidityGaugeToken = new StandardToken(
      fork.config.curve.pools.steth.liquidityGaugeToken,
      hre.ethers.provider,
    );
    const lpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // First, acquire some lpTokens by lending on Curve
    // Seed fund with a surplus of weth
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount.mul(2));
    await curveStethLend({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLPTokenAmount: BigNumber.from(1),
    });

    // Stake the LP tokens
    const preStakeTxLpTokenBalance = await lpToken.balanceOf(vaultProxy);
    const stakeLPTokenAmount = preStakeTxLpTokenBalance.div(2);

    await curveStethStake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
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
    await curveStethUnstake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
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

describe('claim rewards', () => {
  it('should accrue CRV to the VaultProxy after lending and staking, and should be able to claim CRV and LDO via available methods', async () => {
    const [fundOwner, approvedMintForCaller, randomUser] = fork.accounts;
    const curveLiquidityStethAdapter = fork.deployment.CurveLiquidityStethAdapter;
    const crv = new StandardToken(fork.config.primitives.crv, hre.ethers.provider);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const gauge = new CurveLiquidityGaugeV2(fork.config.curve.pools.steth.liquidityGaugeToken, hre.ethers.provider);
    const minter = new CurveMinter(fork.config.curve.minter, hre.ethers.provider);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner as SignerWithAddress,
      fundOwner,
      fundDeployer: fork.deployment.FundDeployer,
      denominationAsset: weth,
    });

    // Lend and stake to start accruing rewards
    const outgoingWethAmount = utils.parseEther('2');
    await weth.transfer(vaultProxy, outgoingWethAmount);
    await curveStethLendAndStake({
      comptrollerProxy,
      integrationManager: fork.deployment.IntegrationManager,
      fundOwner,
      curveLiquidityStethAdapter,
      outgoingWethAmount,
      outgoingStethAmount: BigNumber.from(0),
      minIncomingLiquidityGaugeTokenAmount: BigNumber.from(1),
    });

    // Warp ahead in time to accrue rewards
    await hre.ethers.provider.send('evm_increaseTime', [86400]);

    // Claim accrued CRV from the Minter directly via mint() and assert CRV balance increase
    await curveMinterMint({
      comptrollerProxy,
      minter,
      gauge,
    });
    const postMintTxCrvBalance = await crv.balanceOf(vaultProxy);
    expect(postMintTxCrvBalance).toBeGtBigNumber(0);

    // Warp ahead in time to accrue rewards
    await hre.ethers.provider.send('evm_increaseTime', [86400]);

    // Claim accrued CRV from the Minter directly via mint_many()
    await curveMinterMintMany({
      comptrollerProxy,
      minter,
      gauges: [gauge],
    });
    const postMintManyTxCrvBalance = await crv.balanceOf(vaultProxy);
    expect(postMintManyTxCrvBalance).toBeGtBigNumber(postMintTxCrvBalance);

    // Claim accrued CRV from the Minter by a third party via mint_for()
    await curveMinterToggleApproveMint({
      comptrollerProxy,
      minter,
      account: approvedMintForCaller,
    });

    await minter.connect(approvedMintForCaller).mint_for(gauge, vaultProxy);
    expect(await crv.balanceOf(vaultProxy)).toBeGtBigNumber(postMintManyTxCrvBalance);

    // Claim accrued LDO rewards by a random user
    const ldo = new StandardToken('0x5a98fcbea516cf06857215779fd812ca3bef1b32', hre.ethers.provider);
    await gauge.connect(randomUser).claim_rewards(vaultProxy);
    expect(await ldo.balanceOf(vaultProxy)).toBeGtBigNumber(0);
  });
});
