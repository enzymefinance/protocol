import { SignerWithAddress } from '@enzymefinance/hardhat';
import { ComptrollerLib, StandardToken, UniswapV3LiquidityPositionLib, VaultLib } from '@enzymefinance/protocol';
import {
  assertEvent,
  createNewFund,
  createUniswapV3LiquidityPosition,
  deployProtocolFixture,
  getAssetUnit,
  IUniswapV3NonFungibleTokenManager,
  ProtocolDeployment,
  UniswapV3FeeAmount,
  uniswapV3LiquidityPositionAddLiquidity,
  uniswapV3LiquidityPositionCollect,
  uniswapV3LiquidityPositionGetMaxTick,
  uniswapV3LiquidityPositionGetMinTick,
  uniswapV3LiquidityPositionMint,
  uniswapV3LiquidityPositionRemoveLiquidity,
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
    signer: fundOwner,
    fundOwner,
    fundDeployer: fork.deployment.fundDeployer,
    denominationAsset: new StandardToken(fork.config.primitives.usdc, hre.ethers.provider),
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;
});

describe('init', () => {
  it.todo('write tests');
});

describe('receiveCallFromVault', () => {
  let uniswapV3LiquidityPositionDaiUsdc: UniswapV3LiquidityPositionLib;

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
    uniswapV3LiquidityPositionDaiUsdc = new UniswapV3LiquidityPositionLib(uniswapV3LiquidityPositionAddress, provider);
  });

  it('reverts when it is called from an account different than vault', async () => {
    await expect(
      uniswapV3LiquidityPositionDaiUsdc.connect(fundOwner).receiveCallFromVault(utils.randomBytes(0)),
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

      const preTxNftsCount = (await uniswapV3LiquidityPositionDaiUsdc.getNftIds()).length;
      const preVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const preVaultToken1Balance = await token1.balanceOf(vaultProxy);

      const { nftId, receipt } = await uniswapV3LiquidityPositionMint({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        fee,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
      });

      const postVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const postVaultToken1Balance = await token1.balanceOf(vaultProxy);

      // Assert the NFT position was created correctly in Uniswap
      const positions = await nftManager.positions(nftId);
      expect(positions).toMatchFunctionOutput(nftManager.positions, {
        nonce: expect.anything(),
        operator: constants.AddressZero,
        token0,
        token1,
        fee,
        tickLower,
        tickUpper,
        liquidity: expect.anything(),
        feeGrowthInside0LastX128: 0,
        feeGrowthInside1LastX128: 0,
        tokensOwed0: 0,
        tokensOwed1: 0,
      });
      expect(positions.liquidity).toBeGtBigNumber(0);

      // Assert correct local state change and event
      const postTxNftIds = await uniswapV3LiquidityPositionDaiUsdc.getNftIds();
      expect(postTxNftIds.length).toBe(preTxNftsCount + 1);
      expect(postTxNftIds[postTxNftIds.length - 1]).toEqBigNumber(nftId);

      assertEvent(receipt, uniswapV3LiquidityPositionDaiUsdc.abi.getEvent('NFTPositionAdded'), {
        tokenId: nftId,
      });

      // Assert expected token balance changes

      // No tokens should remain in the external position proxy
      expect(await token0.balanceOf(uniswapV3LiquidityPositionDaiUsdc)).toEqBigNumber(0);
      expect(await token1.balanceOf(uniswapV3LiquidityPositionDaiUsdc)).toEqBigNumber(0);

      // There should be a remaining balance of either token0 or token1 in the vault, as not the entire amount of both would be fully spent
      const netTokenBalancesDiff = preVaultToken0Balance
        .add(preVaultToken1Balance)
        .sub(postVaultToken0Balance)
        .sub(postVaultToken1Balance);
      expect(netTokenBalancesDiff).toBeGtBigNumber(0);

      // Managed assets should be roughly the amount of assets added
      const managedAssets = await uniswapV3LiquidityPositionDaiUsdc.getManagedAssets.call();
      expect(managedAssets.amounts_[0]).toBeAroundBigNumber(amount0Desired);
      expect(managedAssets.amounts_[1]).toBeAroundBigNumber(amount1Desired);
    });
  });

  describe('AddLiquidity', () => {
    it('works as expected (different decimal pair tokens)', async () => {
      const token0 = new StandardToken(fork.config.primitives.dai, whales.dai);
      const token1 = new StandardToken(fork.config.primitives.usdc, whales.usdc);

      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      // Use max range, so a pair of stables should get roughly the same value for both assets
      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

      const { nftId } = await uniswapV3LiquidityPositionMint({
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        fee: UniswapV3FeeAmount.LOW,
        tickLower,
        tickUpper,
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
      });

      const addLiquidityAmount0Desired = mintAmount0Desired;
      const addLiquidityAmount1Desired = mintAmount1Desired;

      const positionsBefore = await nftManager.positions(nftId);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, addLiquidityAmount0Desired);
      await token1.transfer(vaultProxy, addLiquidityAmount1Desired);

      const preVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const preVaultToken1Balance = await token1.balanceOf(vaultProxy);

      await uniswapV3LiquidityPositionAddLiquidity({
        comptrollerProxy: comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        nftId,
        amount0Desired: addLiquidityAmount0Desired,
        amount1Desired: addLiquidityAmount1Desired,
      });

      const postVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const postVaultToken1Balance = await token1.balanceOf(vaultProxy);

      // Liquidity should have increased
      const positionsAfter = await nftManager.positions(nftId);
      expect(positionsAfter.liquidity).toBeGteBigNumber(positionsBefore.liquidity);

      // Assert expected token balance changes

      // No tokens should remain in the external position proxy
      expect(await token0.balanceOf(uniswapV3LiquidityPositionDaiUsdc)).toEqBigNumber(0);
      expect(await token1.balanceOf(uniswapV3LiquidityPositionDaiUsdc)).toEqBigNumber(0);

      // There should be a remaining balance of either token0 or token1 in the vault, as not the entire amount of both would be fully spent
      const netTokenBalancesDiff = preVaultToken0Balance
        .add(preVaultToken1Balance)
        .sub(postVaultToken0Balance)
        .sub(postVaultToken1Balance);
      expect(netTokenBalancesDiff).toBeGtBigNumber(0);

      // Managed assets should be roughly 2x the amount of assets added
      const managedAssets = await uniswapV3LiquidityPositionDaiUsdc.getManagedAssets.call();

      expect(managedAssets.amounts_[0]).toBeAroundBigNumber(addLiquidityAmount0Desired.add(mintAmount0Desired));
      expect(managedAssets.amounts_[1]).toBeAroundBigNumber(addLiquidityAmount1Desired.add(mintAmount1Desired));
    });
  });

  describe('RemoveLiquidity', () => {
    it('works as expected (different decimal pair tokens)', async () => {
      const token0 = new StandardToken(fork.config.primitives.dai, whales.dai);
      const token1 = new StandardToken(fork.config.primitives.usdc, whales.usdc);

      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

      const { nftId } = await uniswapV3LiquidityPositionMint({
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        fee: UniswapV3FeeAmount.LOW,
        tickLower,
        tickUpper,
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
      });

      // Remove half of liquidity
      const positionsBefore = await nftManager.positions(nftId);
      const liquidityRemoved = positionsBefore.liquidity.div(2);

      const preVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const preVaultToken1Balance = await token1.balanceOf(vaultProxy);

      await uniswapV3LiquidityPositionRemoveLiquidity({
        comptrollerProxy: comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        nftId,
        liquidity: liquidityRemoved,
      });

      // Assert desired liquidity was removed
      const positionsAfter = await nftManager.positions(nftId);
      expect(positionsAfter.liquidity).toEqBigNumber(positionsBefore.liquidity.sub(liquidityRemoved));

      // Vault balances of both tokens should have increased (no need to assert exact amounts, i.e., test that UniV3 works)
      expect(await token0.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken0Balance);
      expect(await token1.balanceOf(vaultProxy)).toBeGtBigNumber(preVaultToken1Balance);
    });
  });

  describe('Collect', () => {
    it('works as expected', async () => {
      const token0 = new StandardToken(fork.config.primitives.dai, whales.dai);
      const token1 = new StandardToken(fork.config.primitives.usdc, whales.usdc);

      const mintAmount0Desired = await getAssetUnit(token0);
      const mintAmount1Desired = await getAssetUnit(token1);

      const tickLower = uniswapV3LiquidityPositionGetMinTick(UniswapV3FeeAmount.LOW);
      const tickUpper = uniswapV3LiquidityPositionGetMaxTick(UniswapV3FeeAmount.LOW);

      // Seed fund with tokens
      await token0.transfer(vaultProxy, mintAmount0Desired);
      await token1.transfer(vaultProxy, mintAmount1Desired);

      const { nftId } = await uniswapV3LiquidityPositionMint({
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        fee: UniswapV3FeeAmount.LOW,
        tickLower,
        tickUpper,
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
      });

      // Execute an order to collect fees
      await uniswapV3TakeOrder({
        comptrollerProxy,
        integrationManager: fork.deployment.integrationManager,
        fundOwner,
        uniswapV3Adapter: fork.deployment.uniswapV3Adapter,
        pathAddresses: [token0, token1],
        pathFees: [BigNumber.from(UniswapV3FeeAmount.LOW)],
        outgoingAssetAmount: utils.parseEther('10000'),
        minIncomingAssetAmount: 1,
        seedFund: true,
      });

      // Add again liquidity to restore the state of tokens owed to the latest state
      // (A swap does not update the NFT manager state)
      const addLiquidityAmount0Desired = mintAmount0Desired;
      const addLiquidityAmount1Desired = mintAmount1Desired;

      // Seed fund with tokens
      await token0.transfer(vaultProxy, addLiquidityAmount0Desired);
      await token1.transfer(vaultProxy, addLiquidityAmount1Desired);

      await uniswapV3LiquidityPositionAddLiquidity({
        comptrollerProxy: comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        nftId,
        amount0Desired: addLiquidityAmount0Desired,
        amount1Desired: addLiquidityAmount1Desired,
      });

      const positionsBefore = await nftManager.positions(nftId);

      const preCollectVaultToken0Balance = await token0.balanceOf(vaultProxy);
      const preCollectVaultToken1Balance = await token1.balanceOf(vaultProxy);

      await uniswapV3LiquidityPositionCollect({
        comptrollerProxy: comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        nftId,
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
    });
  });

  describe('getManagedAssets', () => {
    fit('works as expected (wide range, different price)', async () => {
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
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPositionDaiUsdc,
        fee: UniswapV3FeeAmount.LOW,
        tickLower,
        tickUpper,
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPositionDaiUsdc.getManagedAssets.call();

      // Using two stablecoins, the amount of managed assets should be roughly the supplied amount
      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeAroundBigNumber(mintAmount0Desired);
      expect(amounts_[1]).toBeAroundBigNumber(mintAmount1Desired);
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
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPositionAddress,
        fee: UniswapV3FeeAmount.LOW,
        tickLower,
        tickUpper,
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
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
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPositionAddress,
        fee: UniswapV3FeeAmount.LOW,
        tickLower,
        tickUpper,
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
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
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        tickLower,
        tickUpper,
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
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
        signer: fundOwner,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: uniswapV3LiquidityPosition,
        fee: UniswapV3FeeAmount.LOW,
        tickLower,
        tickUpper,
        amount0Desired: mintAmount0Desired,
        amount1Desired: mintAmount1Desired,
      });

      const { assets_, amounts_ } = await uniswapV3LiquidityPosition.getManagedAssets.call();
      expect(assets_[0]).toEqual(token0.address);
      expect(assets_[1]).toEqual(token1.address);
      expect(amounts_[0]).toBeGteBigNumber(BigNumber.from('0'));
      expect(amounts_[1]).toEqBigNumber(BigNumber.from('0'));
    });
  });
});
