import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import { MAX_UINT128, StandardToken, UniswapV3LiquidityPositionLib } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertEvent,
  createNewFund,
  createUniswapV3LiquidityPosition,
  deployProtocolFixture,
  getAssetUnit,
  IUniswapV3NonFungibleTokenManager,
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
import hre from 'hardhat';

let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let fundOwner: SignerWithAddress;

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;

  const newFundRes = await createNewFund({
    denominationAsset: new StandardToken(fork.config.primitives.usdc, hre.ethers.provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;
});

describe('init', () => {
  it('does not allow an incorrect token order', async () => {
    const { token0, token1 } = uniswapV3OrderTokenPair({
      tokenA: fork.config.primitives.dai,
      tokenB: fork.config.primitives.usdc,
    });

    await expect(
      createUniswapV3LiquidityPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        token0: token1,
        token1: token0,
      }),
    ).rejects.toBeRevertedWith('Incorrect token order');
  });

  it('does not allow an asset outside of the asset universe', async () => {
    const { token0, token1 } = uniswapV3OrderTokenPair({
      tokenA: fork.config.primitives.dai,
      tokenB: randomAddress(),
    });

    await expect(
      createUniswapV3LiquidityPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        token0,
        token1,
      }),
    ).rejects.toBeRevertedWith('Unsupported pair');
  });

  it('does not allow two derivative assets', async () => {
    const { token0, token1 } = uniswapV3OrderTokenPair({
      tokenA: fork.config.compound.ctokens.cdai,
      tokenB: fork.config.compound.ctokens.cusdc,
    });

    await expect(
      createUniswapV3LiquidityPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        token0,
        token1,
      }),
    ).rejects.toBeRevertedWith('Unsupported pair');
  });

  it('happy path', async () => {
    const { token0, token1 } = uniswapV3OrderTokenPair({
      tokenA: fork.config.primitives.dai,
      tokenB: fork.config.primitives.usdc,
    });

    const { externalPositionProxyAddress, receipt } = await createUniswapV3LiquidityPosition({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      signer: fundOwner,
      token0,
      token1,
    });
    const uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(externalPositionProxyAddress, provider);

    // Assert state
    expect(await uniswapV3LiquidityPosition.getToken0()).toMatchAddress(token0);
    expect(await uniswapV3LiquidityPosition.getToken1()).toMatchAddress(token1);

    // Assert event
    assertEvent(receipt, uniswapV3LiquidityPosition.abi.getEvent('Initialized'), {
      token0,
      token1,
    });

    expect(receipt).toCostAround(611264);
  });
});

describe('receiveCallFromVault', () => {
  let uniswapV3LiquidityPosition: UniswapV3LiquidityPositionLib;

  let nftManager: IUniswapV3NonFungibleTokenManager;
  let token0: StandardToken, token1: StandardToken;
  beforeEach(async () => {
    nftManager = new IUniswapV3NonFungibleTokenManager(fork.config.uniswapV3.nonFungiblePositionManager, provider);
    token0 = new StandardToken(fork.config.primitives.dai, whales.dai);
    token1 = new StandardToken(fork.config.primitives.usdc, whales.usdc);

    const uniswapV3LiquidityPositionAddress = (
      await createUniswapV3LiquidityPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        token0,
        token1,
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
    it('works as expected (different decimal pair tokens)', async () => {
      const amount0Desired = await getAssetUnit(token0);
      const amount1Desired = await getAssetUnit(token1);
      const fee = UniswapV3FeeAmount.LOW;
      // Use max range, so a pair of stables should get roughly the same value for both assets
      const tickLower = uniswapV3LiquidityPositionGetMinTick(fee);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(fee);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, amount0Desired);
      await token1.transfer(vaultProxy, amount1Desired);

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
      });

      const postVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const postVaultToken1Balance = await token1.balanceOf(vaultProxy);

      // Assert the NFT position was created correctly in Uniswap
      const positions = await nftManager.positions(nftId);
      expect(positions).toMatchFunctionOutput(nftManager.positions, {
        fee,
        feeGrowthInside0LastX128: 0,
        feeGrowthInside1LastX128: 0,
        liquidity: expect.anything(),
        nonce: expect.anything(),
        operator: constants.AddressZero,
        tickLower,
        tickUpper,
        token0,
        token1,
        tokensOwed0: 0,
        tokensOwed1: 0,
      });
      expect(positions.liquidity).toBeGtBigNumber(0);

      // Assert correct local state change and event
      const postTxNftIds = await uniswapV3LiquidityPosition.getNftIds();
      expect(postTxNftIds.length).toBe(preTxNftsCount + 1);
      expect(postTxNftIds[postTxNftIds.length - 1]).toEqBigNumber(nftId);

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
      expect(managedAssets.amounts_[0]).toBeAroundBigNumber(amount0Desired);
      expect(managedAssets.amounts_[1]).toBeAroundBigNumber(amount1Desired);

      expect(receipt).toCostAround(679395);
    });
  });

  describe('AddLiquidity', () => {
    it('works as expected (different decimal pair tokens)', async () => {
      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      // Use max range, so a pair of stables should get roughly the same value for both assets
      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

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
      });

      const addLiquidityAmount0Desired = mintAmount0Desired;
      const addLiquidityAmount1Desired = mintAmount1Desired;

      const positionsBefore = await nftManager.positions(nftId);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, addLiquidityAmount0Desired);
      await token1.transfer(vaultProxy, addLiquidityAmount1Desired);

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
      expect(positionsAfter.liquidity).toBeGteBigNumber(positionsBefore.liquidity);

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

      expect(receipt).toCostAround(324201);
    });
  });

  describe('RemoveLiquidity', () => {
    it('works as expected (different decimal pair tokens)', async () => {
      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

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
      });

      // Remove half of liquidity
      const positionsBefore = await nftManager.positions(nftId);
      const liquidityRemoved = positionsBefore.liquidity.div(2);

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
      expect(positionsAfter.liquidity).toEqBigNumber(positionsBefore.liquidity.sub(liquidityRemoved));

      // Vault balances of both tokens should have increased (no need to assert exact amounts, i.e., test that UniV3 works)
      expect(await token0.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken0Balance);
      expect(await token1.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken1Balance);

      expect(receipt).toCostAround(369504);
    });
  });

  describe('Collect', () => {
    it('works as expected', async () => {
      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

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
        seedFund: true,
        uniswapV3Adapter: fork.deployment.uniswapV3Adapter,
      });

      // Add again liquidity to restore the state of tokens owed to the latest state
      // (A swap does not update the NFT manager state)
      const addLiquidityAmount0Desired = mintAmount0Desired;
      const addLiquidityAmount1Desired = mintAmount1Desired;

      // Seed fund with tokens
      await token0.transfer(vaultProxy, addLiquidityAmount0Desired);
      await token1.transfer(vaultProxy, addLiquidityAmount1Desired);

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
        positionsBefore.tokensOwed0.sub(positionsAfter.tokensOwed0),
      );
      expect(postCollectVaultToken1Balance.sub(preCollectVaultToken1Balance)).toEqBigNumber(
        positionsBefore.tokensOwed1.sub(positionsAfter.tokensOwed1),
      );

      expect(receipt).toCostAround(252174);
    });

    describe('Purge', () => {
      it('works as expected (liquidity specified)', async () => {
        const mintAmount0Desired = await getAssetUnit(token0);
        const mintAmount1Desired = await getAssetUnit(token1);

        const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
        const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

        // Seed fund with tokens
        await token0.transfer(vaultProxy, mintAmount0Desired);
        await token1.transfer(vaultProxy, mintAmount1Desired);

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
        });

        // Purge
        const nftInfo = await nftManager.positions(nftId);

        const preVaultToken0Balance = await token0.balanceOf(vaultProxy);
        const preVaultToken1Balance = await token1.balanceOf(vaultProxy);

        const receipt = await uniswapV3LiquidityPositionPurge({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          externalPositionProxy: uniswapV3LiquidityPosition,
          liquidity: nftInfo.liquidity,
          nftId,
          signer: fundOwner,
        });

        // Assert the old nft was removed from the external position
        expect(await uniswapV3LiquidityPosition.getNftIds()).not.toContain(nftId);

        // Vault balances of both tokens should have increased (no need to assert exact amounts, i.e., test that UniV3 works)
        expect(await token0.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken0Balance);
        expect(await token1.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken1Balance);

        expect(receipt).toCostAround(386720);
      });

      it('works as expected (max liquidity specified)', async () => {
        const mintAmount0Desired = await getAssetUnit(token0);
        const mintAmount1Desired = await getAssetUnit(token1);

        // Seed fund with tokens
        await token0.transfer(vaultProxy, mintAmount0Desired);
        await token1.transfer(vaultProxy, mintAmount1Desired);

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

        expect(receipt).toCostAround(391226);
      });
    });
  });

  describe('getManagedAssets', () => {
    it('works as expected (wide range, different price)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new StandardToken(fork.config.primitives.dai, whales.dai);
      const token1 = new StandardToken(fork.config.primitives.usdc, whales.usdc);

      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.MEDIUM);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.MEDIUM);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

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
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      // Using two stablecoins, the amount of managed assets should be roughly the supplied amount
      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeAroundBigNumber(mintAmount0Desired);
      expect(amounts_[1]).toBeAroundBigNumber(mintAmount1Desired);

      expect(await uniswapV3LiquidityPosition.connect(fundOwner).getManagedAssets()).toCostAround(174106);
    });

    it('works as expected (wide range, same decimals, same price)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new StandardToken(fork.config.primitives.busd, whales.busd);
      const token1 = new StandardToken(fork.config.primitives.dai, whales.dai);

      const mintAmount0Desired = utils.parseUnits('1', 18);
      const mintAmount1Desired = utils.parseUnits('1', 18);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.MEDIUM);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.MEDIUM);

      const uniswapV3LiquidityPositionAddress = (
        await createUniswapV3LiquidityPosition({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          signer: fundOwner,
          token0,
          token1,
        })
      ).externalPositionProxyAddress;

      const uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

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
      const token0 = new StandardToken(fork.config.primitives.busd, whales.busd);
      const token1 = new StandardToken(fork.config.primitives.dai, whales.dai);

      const mintAmount0Desired = utils.parseUnits('1', 18);
      const mintAmount1Desired = utils.parseUnits('1', 18);

      const tickLower = -100;
      const tickUpper = 100;

      const uniswapV3LiquidityPositionAddress = (
        await createUniswapV3LiquidityPosition({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          signer: fundOwner,
          token0,
          token1,
        })
      ).externalPositionProxyAddress;

      const uniswapV3LiquidityPosition = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

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
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeGteBigNumber(BigNumber.from('0'));
      expect(amounts_[1]).toBeGteBigNumber(BigNumber.from('0'));
    });

    it('works as expected (small range, same price, price above range)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new StandardToken(fork.config.primitives.busd, whales.busd);
      const token1 = new StandardToken(fork.config.primitives.dai, whales.dai);

      const mintAmount0Desired = utils.parseUnits('1', 18);
      const mintAmount1Desired = utils.parseUnits('1', 18);

      const tickLower = -5000;
      const tickUpper = -4000;

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

      const uniswapV3LiquidityPositionAddress = (
        await createUniswapV3LiquidityPosition({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          signer: fundOwner,
          token0,
          token1,
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
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();

      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toEqBigNumber(BigNumber.from('0'));
      expect(amounts_[1]).toBeGteBigNumber(BigNumber.from('0'));
    });

    it('works as expected (small range, same price, price below range)', async () => {
      const [fundOwner] = fork.accounts;
      const token0 = new StandardToken(fork.config.primitives.busd, whales.busd);
      const token1 = new StandardToken(fork.config.primitives.dai, whales.dai);

      const mintAmount0Desired = utils.parseUnits('1', 18);
      const mintAmount1Desired = utils.parseUnits('1', 18);

      const tickLower = 4000;
      const tickUpper = 5000;

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

      const uniswapV3LiquidityPositionAddress = (
        await createUniswapV3LiquidityPosition({
          comptrollerProxy,
          externalPositionManager: fork.deployment.externalPositionManager,
          signer: fundOwner,
          token0,
          token1,
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
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();
      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeGteBigNumber(BigNumber.from('0'));
      expect(amounts_[1]).toEqBigNumber(BigNumber.from('0'));
    });
  });
});
