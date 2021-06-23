import { extractEvent } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  AggregatedDerivativePriceFeed,
  ChainlinkPriceFeed,
  ComptrollerLib,
  feeManagerConfigArgs,
  IntegrationManager,
  performanceFeeConfigArgs,
  RevertingPriceFeed,
  StandardToken,
  UniswapV2Adapter,
  VaultLib,
} from '@enzymefinance/protocol';
import { buyShares, createNewFund, redeemShares, uniswapV2TakeOrder } from '@enzymefinance/testutils';
import { utils } from 'ethers';

// Note: One fork is used for the entire test suite, so test ordering is important

let aggregatedDerivativePriceFeed: AggregatedDerivativePriceFeed,
  chainlinkPriceFeed: ChainlinkPriceFeed,
  integrationManager: IntegrationManager,
  revertingPriceFeed: RevertingPriceFeed,
  uniswapV2Adapter: UniswapV2Adapter;
let denominationAsset: StandardToken, fundOwner: SignerWithAddress;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let tradingAsset: StandardToken;

beforeAll(async () => {
  // System contracts
  aggregatedDerivativePriceFeed = fork.deployment.aggregatedDerivativePriceFeed;
  chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
  integrationManager = fork.deployment.integrationManager;
  revertingPriceFeed = fork.deployment.revertingPriceFeed;
  uniswapV2Adapter = fork.deployment.uniswapV2Adapter;

  // Fund config and contracts
  denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
  [fundOwner] = fork.accounts;

  const newFundRes = await createNewFund({
    signer: fundOwner,
    fundOwner,
    denominationAsset,
    fundDeployer: fork.deployment.fundDeployer,
    // Include PerformanceFee to test reverting behavior when GAV calc fails
    feeManagerConfig: feeManagerConfigArgs({
      fees: [fork.deployment.performanceFee],
      settings: [
        performanceFeeConfigArgs({
          rate: utils.parseEther('.05'),
          period: 1,
        }),
      ],
    }),
  });
  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;

  // Misc vars
  tradingAsset = new StandardToken(fork.config.weth, provider);

  // Seed investor with denomination asset and buy shares, which seeds fund with denomination asset
  const investmentAmount = utils.parseUnits('10', await denominationAsset.decimals());
  await denominationAsset.transfer(fundOwner, investmentAmount);
  await buyShares({
    comptrollerProxy,
    denominationAsset,
    signer: fundOwner,
    buyers: [fundOwner],
    investmentAmounts: [investmentAmount],
  });
});

describe('unsupported denomination asset', () => {
  beforeAll(async () => {
    // Remove the denomination asset from supported assets by removing it as a primitive
    await chainlinkPriceFeed.removePrimitives([denominationAsset]);
  });

  it('does NOT allow buying shares', async () => {
    await expect(
      buyShares({
        comptrollerProxy,
        signer: fundOwner,
        buyers: [fundOwner],
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('Unsupported _quoteAsset');
  });

  it('allows trading away the denomination asset', async () => {
    await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path: [denominationAsset, tradingAsset],
      outgoingAssetAmount: (await denominationAsset.balanceOf(vaultProxy)).div(2),
      minIncomingAssetAmount: 1,
    });
  });

  it('does NOT allow trading into the denomination asset', async () => {
    await expect(
      uniswapV2TakeOrder({
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        fundOwner,
        uniswapV2Adapter,
        path: [tradingAsset, denominationAsset],
        outgoingAssetAmount: (await tradingAsset.balanceOf(vaultProxy)).div(2),
        minIncomingAssetAmount: 1,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');
  });

  it('allows redeeming shares, with an emitted PreRedeemShares hook failure event', async () => {
    const redeemSharesTx = await redeemShares({
      comptrollerProxy,
      signer: fundOwner,
      quantity: (await vaultProxy.balanceOf(fundOwner)).div(2),
    });

    const failureEvents = extractEvent(redeemSharesTx as any, 'PreRedeemSharesHookFailed');
    expect(failureEvents.length).toBe(1);
  });
});

describe('denomination asset supported only via RevertingPriceFeed', () => {
  beforeAll(async () => {
    await aggregatedDerivativePriceFeed.addDerivatives([denominationAsset], [revertingPriceFeed]);
  });

  it('does NOT allow buy shares', async () => {
    await expect(
      buyShares({
        comptrollerProxy,
        signer: fundOwner,
        buyers: [fundOwner],
        denominationAsset,
      }),
    ).rejects.toBeRevertedWith('Unsupported _quoteAsset');
  });

  it('allows trading away the denomination asset', async () => {
    await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path: [denominationAsset, tradingAsset],
      outgoingAssetAmount: (await denominationAsset.balanceOf(vaultProxy)).div(2),
      minIncomingAssetAmount: 1,
    });
  });

  it('allows trading into the denomination asset', async () => {
    await uniswapV2TakeOrder({
      comptrollerProxy,
      vaultProxy,
      integrationManager,
      fundOwner,
      uniswapV2Adapter,
      path: [tradingAsset, denominationAsset],
      outgoingAssetAmount: (await tradingAsset.balanceOf(vaultProxy)).div(2),
      minIncomingAssetAmount: 1,
    });
  });

  it('allows redeeming shares, with an emitted PreRedeemShares hook failure event', async () => {
    const redeemSharesTx = await redeemShares({
      comptrollerProxy,
      signer: fundOwner,
      quantity: (await vaultProxy.balanceOf(fundOwner)).div(2),
    });

    const failureEvents = extractEvent(redeemSharesTx as any, 'PreRedeemSharesHookFailed');
    expect(failureEvents.length).toBe(1);
  });
});
