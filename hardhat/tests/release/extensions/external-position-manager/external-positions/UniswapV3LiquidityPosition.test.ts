import { randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  callOnExternalPositionArgs,
  ITestStandardToken,
  ITestUniswapV3NonFungibleTokenManager,
  MAX_UINT128,
  UniswapV3LiquidityPositionActionId,
  UniswapV3LiquidityPositionLib,
  uniswapV3LiquidityPositionMintArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertExternalPositionAssetsToReceive,
  createNewFund,
  createUniswapV3LiquidityPosition,
  deployProtocolFixture,
  getAssetUnit,
  setAccountBalance,
  UniswapV3FeeAmount,
  uniswapV3LiquidityPositionAddLiquidity,
  uniswapV3LiquidityPositionCollect,
  uniswapV3LiquidityPositionGetMaxTick,
  uniswapV3LiquidityPositionGetMinTick,
  uniswapV3LiquidityPositionMint,
  uniswapV3LiquidityPositionPurge,
  uniswapV3LiquidityPositionRemoveLiquidity,
  uniswapV3OrderTokenPair,
  uniswapV3TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let fundOwner: SignerWithAddress;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;

  const newFundRes = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;
});

describe('init', () => {
  it('happy path', async () => {
    const { receipt } = await createUniswapV3LiquidityPosition({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      signer: fundOwner,
    });

    expect(receipt).toMatchInlineGasSnapshot(`478595`);
  });

  it('can create and Mint in same tx', async () => {
    const nftManager = new ITestUniswapV3NonFungibleTokenManager(
      fork.config.uniswapV3.nonFungiblePositionManager,
      provider,
    );
    const token0 = new ITestStandardToken(fork.config.primitives.dai, provider);
    const token1 = new ITestStandardToken(fork.config.primitives.usdc, provider);
    const fee = UniswapV3FeeAmount.LOW;
    const tickLower = uniswapV3LiquidityPositionGetMinTick(fee);
    const tickUpper = uniswapV3LiquidityPositionGetMaxTick(fee);
    const amount0Desired = await getAssetUnit(token0);
    const amount1Desired = await getAssetUnit(token1);

    await setAccountBalance({ provider, account: vaultProxy, amount: amount0Desired, token: token0 });
    await setAccountBalance({ provider, account: vaultProxy, amount: amount1Desired, token: token1 });

    // Define Mint action calldata
    const actionArgs = uniswapV3LiquidityPositionMintArgs({
      amount0Desired,
      amount0Min: 1,
      amount1Desired,
      amount1Min: 1,
      fee,
      tickLower,
      tickUpper,
      token0,
      token1,
    });

    // Uses externalPositionProxy = AddressZero since this value is ignored
    const callOnExternalPositionData = callOnExternalPositionArgs({
      actionArgs,
      actionId: UniswapV3LiquidityPositionActionId.Mint,
      externalPositionProxy: constants.AddressZero,
    });

    // Create external position with bundled first action
    const uniswapV3LiquidityPositionAddress = (
      await createUniswapV3LiquidityPosition({
        callOnExternalPositionData,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
      })
    ).externalPositionProxyAddress;
    const uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);

    // NFT should have been created
    const nftIds = await uniswapV3LiquidityPosition.getNftIds();

    expect(nftIds.length).toBe(1);
    const nftId = nftIds[0];

    // Assert the NFT position was created correctly in Uniswap
    const positions = await nftManager.positions(nftId);

    expect(positions).toMatchFunctionOutput(nftManager.positions, {
      fee_: fee,
      feeGrowthInside0LastX128_: 0,
      feeGrowthInside1LastX128_: 0,
      liquidity_: expect.anything(),
      nonce_: expect.anything(),
      operator_: constants.AddressZero,
      tickLower_: tickLower,
      tickUpper_: tickUpper,
      token0_: token0,
      token1_: token1,
      tokensOwed0_: 0,
      tokensOwed1_: 0,
    });
    expect(positions.liquidity_).toBeGtBigNumber(0);
  });
});

describe('receiveCallFromVault', () => {
  let uniswapV3LiquidityPosition: UniswapV3LiquidityPositionLib;

  let nftManager: ITestUniswapV3NonFungibleTokenManager;
  let token0: ITestStandardToken, token1: ITestStandardToken;

  beforeEach(async () => {
    nftManager = new ITestUniswapV3NonFungibleTokenManager(fork.config.uniswapV3.nonFungiblePositionManager, provider);
    token0 = new ITestStandardToken(fork.config.primitives.dai, provider);
    token1 = new ITestStandardToken(fork.config.primitives.usdc, provider);

    const uniswapV3LiquidityPositionAddress = (
      await createUniswapV3LiquidityPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
      })
    ).externalPositionProxyAddress;

    uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);
  });

  it('reverts when it is called from an account different than vault', async () => {
    await expect(
      uniswapV3LiquidityPosition.connect(fundOwner).receiveCallFromVault(utils.randomBytes(0)),
    ).rejects.toBeRevertedWith('Only the vault can make this call');
  });

  describe('Mint', () => {
    it('does not allow an asset outside of the asset universe', async () => {
      const { token0, token1 } = uniswapV3OrderTokenPair({
        tokenA: fork.config.primitives.dai,
        tokenB: randomAddress(),
      });

      await createUniswapV3LiquidityPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
      });

      const fee = UniswapV3FeeAmount.LOW;
      const tickLower = uniswapV3LiquidityPositionGetMinTick(fee);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(fee);

      await expect(
        uniswapV3LiquidityPositionMint({
          amount0Desired: 1,
          amount1Desired: 1,
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          externalPositionProxy: uniswapV3LiquidityPosition,
          fee,
          signer: fundOwner,
          tickLower,
          tickUpper,
          token0,
          token1,
        }),
      ).rejects.toBeRevertedWith('Unsupported pair');
    });

    it('does not allow two derivative assets', async () => {
      const { token0, token1 } = uniswapV3OrderTokenPair({
        tokenA: fork.config.compoundV2.ctokens.cdai,
        tokenB: fork.config.compoundV2.ctokens.cusdc,
      });

      await createUniswapV3LiquidityPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
      });

      const fee = UniswapV3FeeAmount.LOW;
      const tickLower = uniswapV3LiquidityPositionGetMinTick(fee);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(fee);

      await expect(
        uniswapV3LiquidityPositionMint({
          amount0Desired: 1,
          amount1Desired: 1,
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          externalPositionProxy: uniswapV3LiquidityPosition,
          fee,
          signer: fundOwner,
          tickLower,
          tickUpper,
          token0,
          token1,
        }),
      ).rejects.toBeRevertedWith('Unsupported pair');
    });

    it('works as expected (different decimal pair tokens)', async () => {
      const amount0Desired = await getAssetUnit(token0);
      const amount1Desired = await getAssetUnit(token1);
      const fee = UniswapV3FeeAmount.LOW;
      // Use max range, so a pair of stables should get roughly the same value for both assets
      const tickLower = uniswapV3LiquidityPositionGetMinTick(fee);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(fee);

      await setAccountBalance({ provider, account: vaultProxy, amount: amount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: amount1Desired, token: token1 });

      const preTxNftsCount = (await uniswapV3LiquidityPosition.getNftIds()).length;
      const preVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const preVaultToken1Balance = await token1.balanceOf(vaultProxy);

      const { nftId, receipt } = await uniswapV3LiquidityPositionMint({
        amount0Desired,
        amount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      const postVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const postVaultToken1Balance = await token1.balanceOf(vaultProxy);

      // Assert the NFT position was created correctly in Uniswap
      const positions = await nftManager.positions(nftId);

      expect(positions).toMatchFunctionOutput(nftManager.positions, {
        fee_: fee,
        feeGrowthInside0LastX128_: 0,
        feeGrowthInside1LastX128_: 0,
        liquidity_: expect.anything(),
        nonce_: expect.anything(),
        operator_: constants.AddressZero,
        tickLower_: tickLower,
        tickUpper_: tickUpper,
        token0_: token0,
        token1_: token1,
        tokensOwed0_: 0,
        tokensOwed1_: 0,
      });
      expect(positions.liquidity_).toBeGtBigNumber(0);

      // Assert correct local state change and event
      const postTxNftIds = await uniswapV3LiquidityPosition.getNftIds();

      expect(postTxNftIds.length).toBe(preTxNftsCount + 1);
      expect(postTxNftIds[postTxNftIds.length - 1]).toEqBigNumber(nftId);

      expect(await uniswapV3LiquidityPosition.getToken0ForNft(nftId)).toMatchAddress(token0);
      expect(await uniswapV3LiquidityPosition.getToken1ForNft(nftId)).toMatchAddress(token1);

      assertEvent(receipt, uniswapV3LiquidityPosition.abi.getEvent('NFTPositionAdded'), {
        tokenId: nftId,
      });

      // Assert expected token balance changes

      // No tokens should remain in the external position proxy
      expect(await token0.balanceOf(uniswapV3LiquidityPosition)).toEqBigNumber(0);
      expect(await token1.balanceOf(uniswapV3LiquidityPosition)).toEqBigNumber(0);

      // There should be a remaining balance of either token0 or token1 in the vault, as not the entire amount of both would be fully spent
      const netTokenBalancesDiff = preVaultToken0Balance
        .add(preVaultToken1Balance)
        .sub(postVaultToken0Balance)
        .sub(postVaultToken1Balance);

      expect(netTokenBalancesDiff).toBeGtBigNumber(0);

      // Managed assets should be roughly the amount of assets added
      const managedAssets = await uniswapV3LiquidityPosition.getManagedAssets.call();

      expect(managedAssets.assets_[0]).toMatchAddress(token0);
      expect(managedAssets.assets_[1]).toMatchAddress(token1);
      expect(managedAssets.amounts_[0]).toBeAroundBigNumber(amount0Desired);
      expect(managedAssets.amounts_[1]).toBeAroundBigNumber(amount1Desired);

      assertExternalPositionAssetsToReceive({
        receipt,
        assets: [],
      });

      expect(receipt).toMatchInlineGasSnapshot(`795749`);
    });
  });

  describe('AddLiquidity', () => {
    it('works as expected (different decimal pair tokens)', async () => {
      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      // Use max range, so a pair of stables should get roughly the same value for both assets
      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

      const { nftId } = await uniswapV3LiquidityPositionMint({
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      const addLiquidityAmount0Desired = mintAmount0Desired;
      const addLiquidityAmount1Desired = mintAmount1Desired;

      const positionsBefore = await nftManager.positions(nftId);

      await setAccountBalance({ provider, account: vaultProxy, amount: addLiquidityAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: addLiquidityAmount1Desired, token: token1 });

      const preVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const preVaultToken1Balance = await token1.balanceOf(vaultProxy);

      const receipt = await uniswapV3LiquidityPositionAddLiquidity({
        amount0Desired: addLiquidityAmount0Desired,
        amount1Desired: addLiquidityAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        nftId,
        signer: fundOwner,
      });

      const postVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const postVaultToken1Balance = await token1.balanceOf(vaultProxy);

      // Liquidity should have increased
      const positionsAfter = await nftManager.positions(nftId);

      expect(positionsAfter.liquidity_).toBeGteBigNumber(positionsBefore.liquidity_);

      // Assert expected token balance changes

      // No tokens should remain in the external position proxy
      expect(await token0.balanceOf(uniswapV3LiquidityPosition)).toEqBigNumber(0);
      expect(await token1.balanceOf(uniswapV3LiquidityPosition)).toEqBigNumber(0);

      // There should be a remaining balance of either token0 or token1 in the vault, as not the entire amount of both would be fully spent
      const netTokenBalancesDiff = preVaultToken0Balance
        .add(preVaultToken1Balance)
        .sub(postVaultToken0Balance)
        .sub(postVaultToken1Balance);

      expect(netTokenBalancesDiff).toBeGtBigNumber(0);

      // Managed assets should be roughly 2x the amount of assets added
      const managedAssets = await uniswapV3LiquidityPosition.getManagedAssets.call();

      expect(managedAssets.amounts_[0]).toBeAroundBigNumber(addLiquidityAmount0Desired.add(mintAmount0Desired));
      expect(managedAssets.amounts_[1]).toBeAroundBigNumber(addLiquidityAmount1Desired.add(mintAmount1Desired));

      assertExternalPositionAssetsToReceive({
        receipt,
        assets: [],
      });

      expect(receipt).toMatchInlineGasSnapshot(`338066`);
    });
  });

  describe('RemoveLiquidity', () => {
    it('works as expected (different decimal pair tokens)', async () => {
      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

      const { nftId } = await uniswapV3LiquidityPositionMint({
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      // Remove half of liquidity
      const positionsBefore = await nftManager.positions(nftId);
      const liquidityRemoved = positionsBefore.liquidity_.div(2);

      const preVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const preVaultToken1Balance = await token1.balanceOf(vaultProxy);

      const receipt = await uniswapV3LiquidityPositionRemoveLiquidity({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        liquidity: liquidityRemoved,
        nftId,
        signer: fundOwner,
      });

      // Assert desired liquidity was removed
      const positionsAfter = await nftManager.positions(nftId);

      expect(positionsAfter.liquidity_).toEqBigNumber(positionsBefore.liquidity_.sub(liquidityRemoved));

      // Vault balances of both tokens should have increased (no need to assert exact amounts, i.e., test that UniV3 works)
      expect(await token0.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken0Balance);
      expect(await token1.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken1Balance);

      assertExternalPositionAssetsToReceive({
        receipt,
        assets: [token0, token1],
      });

      expect(receipt).toMatchInlineGasSnapshot(`352972`);
    });
  });

  describe('Collect', () => {
    it('works as expected', async () => {
      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

      const { nftId } = await uniswapV3LiquidityPositionMint({
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      // Execute an order to collect fees
      await uniswapV3TakeOrder({
        comptrollerProxy,
        fundOwner,
        integrationManager: fork.deployment.integrationManager,
        minIncomingAssetAmount: 1,
        outgoingAssetAmount: utils.parseEther('10000'),
        pathAddresses: [token0, token1],
        pathFees: [BigNumber.from(UniswapV3FeeAmount.LOW)],
        provider,
        seedFund: true,
        uniswapV3Adapter: fork.deployment.uniswapV3Adapter,
      });

      // Add again liquidity to restore the state of tokens owed to the latest state
      // (A swap does not update the NFT manager state)
      const addLiquidityAmount0Desired = mintAmount0Desired;
      const addLiquidityAmount1Desired = mintAmount1Desired;

      await setAccountBalance({ provider, account: vaultProxy, amount: addLiquidityAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: addLiquidityAmount1Desired, token: token1 });

      await uniswapV3LiquidityPositionAddLiquidity({
        amount0Desired: addLiquidityAmount0Desired,
        amount1Desired: addLiquidityAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        nftId,
        signer: fundOwner,
      });

      const positionsBefore = await nftManager.positions(nftId);

      const preCollectVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const preCollectVaultToken1Balance = await token1.balanceOf(vaultProxy);

      const receipt = await uniswapV3LiquidityPositionCollect({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        nftId,
        signer: fundOwner,
      });

      const postCollectVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const postCollectVaultToken1Balance = await token1.balanceOf(vaultProxy);

      const positionsAfter = await nftManager.positions(nftId);

      expect(postCollectVaultToken0Balance.sub(preCollectVaultToken0Balance)).toEqBigNumber(
        positionsBefore.tokensOwed0_.sub(positionsAfter.tokensOwed0_),
      );
      expect(postCollectVaultToken1Balance.sub(preCollectVaultToken1Balance)).toEqBigNumber(
        positionsBefore.tokensOwed1_.sub(positionsAfter.tokensOwed1_),
      );

      assertExternalPositionAssetsToReceive({
        receipt,
        assets: [token0, token1],
      });

      expect(receipt).toMatchInlineGasSnapshot(`252742`);
    });

    describe('Purge', () => {
      it('works as expected (liquidity specified)', async () => {
        const mintAmount0Desired = await getAssetUnit(token0);
        const mintAmount1Desired = await getAssetUnit(token1);

        const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
        const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

        await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
        await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

        // Mint
        const { nftId } = await uniswapV3LiquidityPositionMint({
          amount0Desired: mintAmount0Desired,
          amount1Desired: mintAmount1Desired,
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          externalPositionProxy: uniswapV3LiquidityPosition,
          fee: UniswapV3FeeAmount.LOW,
          signer: fundOwner,
          tickLower,
          tickUpper,
          token0,
          token1,
        });

        // Purge
        const nftInfo = await nftManager.positions(nftId);

        const preVaultToken0Balance = await token0.balanceOf(vaultProxy);
        const preVaultToken1Balance = await token1.balanceOf(vaultProxy);

        const receipt = await uniswapV3LiquidityPositionPurge({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          externalPositionProxy: uniswapV3LiquidityPosition,
          liquidity: nftInfo.liquidity_,
          nftId,
          signer: fundOwner,
        });

        // Assert the old nft was removed from the external position
        expect(await uniswapV3LiquidityPosition.getNftIds()).not.toContain(nftId);
        expect(await uniswapV3LiquidityPosition.getToken0ForNft(nftId)).toMatchAddress(constants.AddressZero);
        expect(await uniswapV3LiquidityPosition.getToken1ForNft(nftId)).toMatchAddress(constants.AddressZero);

        // Vault balances of both tokens should have increased (no need to assert exact amounts, i.e., test that UniV3 works)
        expect(await token0.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken0Balance);
        expect(await token1.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken1Balance);

        assertExternalPositionAssetsToReceive({
          receipt,
          assets: [token0, token1],
        });

        expect(receipt).toMatchInlineGasSnapshot(`378441`);
      });

      it('works as expected (max liquidity specified)', async () => {
        const mintAmount0Desired = await getAssetUnit(token0);
        const mintAmount1Desired = await getAssetUnit(token1);

        await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
        await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

        // Mint
        const { nftId } = await uniswapV3LiquidityPositionMint({
          amount0Desired: mintAmount0Desired,
          amount1Desired: mintAmount1Desired,
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          externalPositionProxy: uniswapV3LiquidityPosition,
          fee: UniswapV3FeeAmount.LOW,
          signer: fundOwner,
          tickLower: uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW),
          tickUpper: uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW),
          token0,
          token1,
        });

        // Purge
        const receipt = await uniswapV3LiquidityPositionPurge({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          externalPositionProxy: uniswapV3LiquidityPosition,
          liquidity: MAX_UINT128,
          nftId,
          signer: fundOwner,
        });

        // Assert the old nft was removed from the external position
        expect(await uniswapV3LiquidityPosition.getNftIds()).not.toContain(nftId);

        expect(receipt).toMatchInlineGasSnapshot(`382947`);
      });
    });
  });

  describe('getManagedAssets', () => {
    it('works as expected (multiple nfts of same asset pair, and one nft of unique pool)', async () => {
      const [fundOwner] = fork.accounts;
      // Use all USD stables
      const duplicatePairToken0 = new ITestStandardToken(fork.config.primitives.dai, provider);
      const duplicatePairToken1 = new ITestStandardToken(fork.config.primitives.usdt, provider);
      const uniquePairToken0 = new ITestStandardToken(fork.config.primitives.busd, provider);
      const uniquePairToken1 = new ITestStandardToken(fork.config.primitives.usdc, provider);

      const duplicatePairAmount0Desired = await getAssetUnit(duplicatePairToken0);
      const duplicatePairAmount1Desired = await getAssetUnit(duplicatePairToken1);
      const uniquePairAmount0Desired = await getAssetUnit(uniquePairToken0);
      const uniquePairAmount1Desired = await getAssetUnit(uniquePairToken1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.MEDIUM);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.MEDIUM);

      await setAccountBalance({
        account: vaultProxy,
        amount: duplicatePairAmount0Desired.mul(2),
        provider,
        token: duplicatePairToken0,
      });
      await setAccountBalance({
        account: vaultProxy,
        amount: duplicatePairAmount1Desired.mul(2),
        provider,
        token: duplicatePairToken1,
      });
      await setAccountBalance({
        account: vaultProxy,
        amount: uniquePairAmount0Desired,
        provider,
        token: uniquePairToken0,
      });
      await setAccountBalance({
        account: vaultProxy,
        amount: uniquePairAmount1Desired,
        provider,
        token: uniquePairToken1,
      });

      // Duplicate pair #1
      await uniswapV3LiquidityPositionMint({
        amount0Desired: duplicatePairAmount0Desired,
        amount1Desired: duplicatePairAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0: duplicatePairToken0,
        token1: duplicatePairToken1,
      });

      // Duplicate pair #2
      await uniswapV3LiquidityPositionMint({
        amount0Desired: duplicatePairAmount0Desired,
        amount1Desired: duplicatePairAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0: duplicatePairToken0,
        token1: duplicatePairToken1,
      });

      // Unique pair
      await uniswapV3LiquidityPositionMint({
        amount0Desired: uniquePairAmount0Desired,
        amount1Desired: uniquePairAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0: uniquePairToken0,
        token1: uniquePairToken1,
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      expect(assets_.length).toBe(4);
      expect(assets_[0]).toMatchAddress(duplicatePairToken0);
      expect(assets_[1]).toMatchAddress(duplicatePairToken1);
      expect(assets_[2]).toMatchAddress(uniquePairToken0);
      expect(assets_[3]).toMatchAddress(uniquePairToken1);

      // Using stablecoins, all the amounts of managed assets should be roughly the supplied amount
      expect(amounts_.length).toBe(4);
      expect(amounts_[0]).toBeAroundBigNumber(duplicatePairAmount0Desired.mul(2));
      expect(amounts_[1]).toBeAroundBigNumber(duplicatePairAmount1Desired.mul(2));
      expect(amounts_[2]).toBeAroundBigNumber(uniquePairAmount0Desired);
      expect(amounts_[3]).toBeAroundBigNumber(uniquePairAmount1Desired);

      // Cost should be roughly 25k gas cheaper than 3x the case of a single nft, due to recycling the duplicate rate
      expect(await uniswapV3LiquidityPosition.connect(fundOwner).getManagedAssets()).toMatchInlineGasSnapshot(`347538`);
    });

    it('works as expected (wide range, different price)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new ITestStandardToken(fork.config.primitives.dai, provider);
      const token1 = new ITestStandardToken(fork.config.primitives.usdc, provider);

      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.MEDIUM);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.MEDIUM);

      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

      await uniswapV3LiquidityPositionMint({
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      // Using two stablecoins, the amount of managed assets should be roughly the supplied amount
      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeAroundBigNumber(mintAmount0Desired);
      expect(amounts_[1]).toBeAroundBigNumber(mintAmount1Desired);

      expect(await uniswapV3LiquidityPosition.connect(fundOwner).getManagedAssets()).toMatchInlineGasSnapshot(`174606`);
    });

    it('works as expected (wide range, same decimals, same price)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new ITestStandardToken(fork.config.primitives.busd, provider);
      const token1 = new ITestStandardToken(fork.config.primitives.dai, provider);

      const mintAmount0Desired = utils.parseUnits('1', 18);
      const mintAmount1Desired = utils.parseUnits('1', 18);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.MEDIUM);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.MEDIUM);

      const uniswapV3LiquidityPositionAddress = (
        await createUniswapV3LiquidityPosition({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          signer: fundOwner,
        })
      ).externalPositionProxyAddress;

      const uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);

      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

      await uniswapV3LiquidityPositionMint({
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPositionAddress,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      // Using two stablecoins, the amount of managed assets should be roughly the supplied amount
      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeAroundBigNumber(mintAmount0Desired);
      expect(amounts_[1]).toBeAroundBigNumber(mintAmount1Desired);
    });

    it('works as expected (small range, same price, in range)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new ITestStandardToken(fork.config.primitives.busd, provider);
      const token1 = new ITestStandardToken(fork.config.primitives.dai, provider);

      const mintAmount0Desired = utils.parseUnits('1', 18);
      const mintAmount1Desired = utils.parseUnits('1', 18);

      const tickLower = -100;
      const tickUpper = 100;

      const uniswapV3LiquidityPositionAddress = (
        await createUniswapV3LiquidityPosition({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          signer: fundOwner,
        })
      ).externalPositionProxyAddress;

      const uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);

      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

      await uniswapV3LiquidityPositionMint({
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPositionAddress,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeGteBigNumber(BigNumber.from('0'));
      expect(amounts_[1]).toBeGteBigNumber(BigNumber.from('0'));
    });

    it('works as expected (small range, same price, price above range)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new ITestStandardToken(fork.config.primitives.busd, provider);
      const token1 = new ITestStandardToken(fork.config.primitives.dai, provider);

      const mintAmount0Desired = utils.parseUnits('1', 18);
      const mintAmount1Desired = utils.parseUnits('1', 18);

      const tickLower = -5000;
      const tickUpper = -4000;

      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

      const uniswapV3LiquidityPositionAddress = (
        await createUniswapV3LiquidityPosition({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          signer: fundOwner,
        })
      ).externalPositionProxyAddress;

      const uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);

      await uniswapV3LiquidityPositionMint({
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toEqBigNumber(BigNumber.from('0'));
      expect(amounts_[1]).toBeGteBigNumber(BigNumber.from('0'));
    });

    it('works as expected (small range, same price, price below range)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new ITestStandardToken(fork.config.primitives.busd, provider);
      const token1 = new ITestStandardToken(fork.config.primitives.dai, provider);

      const mintAmount0Desired = utils.parseUnits('1', 18);
      const mintAmount1Desired = utils.parseUnits('1', 18);

      const tickLower = 4000;
      const tickUpper = 5000;

      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount0Desired, token: token0 });
      await setAccountBalance({ provider, account: vaultProxy, amount: mintAmount1Desired, token: token1 });

      const uniswapV3LiquidityPositionAddress = (
        await createUniswapV3LiquidityPosition({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          signer: fundOwner,
        })
      ).externalPositionProxyAddress;

      const uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);

      await uniswapV3LiquidityPositionMint({
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        signer: fundOwner,
        tickLower,
        tickUpper,
        token0,
        token1,
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeGteBigNumber(BigNumber.from('0'));
      expect(amounts_[1]).toEqBigNumber(BigNumber.from('0'));
    });
  });
});
