import { extractEvent } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type {
  ComptrollerLib,
  IntegrationManager,
  RevertingPriceFeed,
  UniswapV2ExchangeAdapter,
  ValueInterpreter,
  VaultLib,
} from '@enzymefinance/protocol';
import { feeManagerConfigArgs, performanceFeeConfigArgs, StandardToken } from '@enzymefinance/protocol';
import { buyShares, createNewFund, redeemSharesInKind, uniswapV2TakeOrder } from '@enzymefinance/testutils';
import { BigNumber } from 'ethers';

// Note: One fork is used for the entire test suite, so test ordering is important

const FIVE_PERCENT = BigNumber.from(500);

let integrationManager: IntegrationManager,
  revertingPriceFeed: RevertingPriceFeed,
  uniswapV2ExchangeAdapter: UniswapV2ExchangeAdapter,
  valueInterpreter: ValueInterpreter;
let denominationAsset: StandardToken, fundOwner: SignerWithAddress;
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let tradingAsset: StandardToken;

beforeAll(async () => {
  // System contracts
  integrationManager = fork.deployment.integrationManager;
  revertingPriceFeed = fork.deployment.revertingPriceFeed;
  uniswapV2ExchangeAdapter = fork.deployment.uniswapV2ExchangeAdapter;
  valueInterpreter = fork.deployment.valueInterpreter;

  // Fund config and contracts
  denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
  [fundOwner] = fork.accounts;

  const newFundRes = await createNewFund({
    denominationAsset,
    // Include PerformanceFee to test reverting behavior when GAV calc fails
    feeManagerConfig: feeManagerConfigArgs({
      fees: [fork.deployment.performanceFee],
      settings: [
        performanceFeeConfigArgs({
          rate: FIVE_PERCENT,
        }),
      ],
    }),

    fundDeployer: fork.deployment.fundDeployer,

    fundOwner,

    // Invest to seed fund with denomination asset balance
    investment: {
      buyer: fundOwner,
      seedBuyer: true,
      provider,
    },

    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;

  // Misc vars
  tradingAsset = new StandardToken(fork.config.weth, provider);
});

describe('unsupported denomination asset', () => {
  beforeAll(async () => {
    // Remove the denomination asset from supported assets by removing it as a primitive
    await valueInterpreter.removePrimitives([denominationAsset]);
  });

  it('does NOT allow buying shares', async () => {
    await expect(
      buyShares({
        buyer: fundOwner,
        comptrollerProxy,
        denominationAsset,
        provider,
      }),
    ).rejects.toBeRevertedWith('Unsupported _quoteAsset');
  });

  it('allows trading away the denomination asset', async () => {
    await uniswapV2TakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager,
      minIncomingAssetAmount: 1,
      outgoingAssetAmount: (await denominationAsset.balanceOf(vaultProxy)).div(2),
      path: [denominationAsset, tradingAsset],
      provider,
      uniswapV2ExchangeAdapter,
      vaultProxy,
    });
  });

  it('does NOT allow trading into the denomination asset', async () => {
    await expect(
      uniswapV2TakeOrder({
        comptrollerProxy,
        fundOwner,
        integrationManager,
        minIncomingAssetAmount: 1,
        outgoingAssetAmount: (await tradingAsset.balanceOf(vaultProxy)).div(2),
        path: [tradingAsset, denominationAsset],
        provider,
        uniswapV2ExchangeAdapter,
        vaultProxy,
      }),
    ).rejects.toBeRevertedWith('Non-receivable incoming asset');
  });

  it('allows redeeming shares, with an emitted PreRedeemShares hook failure event', async () => {
    const redeemSharesTx = await redeemSharesInKind({
      comptrollerProxy,
      quantity: (await vaultProxy.balanceOf(fundOwner)).div(2),
      signer: fundOwner,
    });

    const failureEvents = extractEvent(redeemSharesTx as any, 'PreRedeemSharesHookFailed');

    expect(failureEvents.length).toBe(1);
  });
});

describe('denomination asset supported only via RevertingPriceFeed', () => {
  beforeAll(async () => {
    await valueInterpreter.addDerivatives([denominationAsset], [revertingPriceFeed]);
  });

  it('does NOT allow buy shares', async () => {
    await expect(
      buyShares({
        buyer: fundOwner,
        comptrollerProxy,
        denominationAsset,
        provider,
      }),
    ).rejects.toBeRevertedWith('Unsupported _quoteAsset');
  });

  it('allows trading away the denomination asset', async () => {
    await uniswapV2TakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager,
      minIncomingAssetAmount: 1,
      outgoingAssetAmount: (await denominationAsset.balanceOf(vaultProxy)).div(2),
      path: [denominationAsset, tradingAsset],
      provider,
      uniswapV2ExchangeAdapter,
      vaultProxy,
    });
  });

  it('allows trading into the denomination asset', async () => {
    await uniswapV2TakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager,
      minIncomingAssetAmount: 1,
      outgoingAssetAmount: (await tradingAsset.balanceOf(vaultProxy)).div(2),
      path: [tradingAsset, denominationAsset],
      provider,
      uniswapV2ExchangeAdapter,
      vaultProxy,
    });
  });

  it('allows redeeming shares, with an emitted PreRedeemShares hook failure event', async () => {
    const redeemSharesTx = await redeemSharesInKind({
      comptrollerProxy,
      quantity: (await vaultProxy.balanceOf(fundOwner)).div(2),
      signer: fundOwner,
    });

    const failureEvents = extractEvent(redeemSharesTx as any, 'PreRedeemSharesHookFailed');

    expect(failureEvents.length).toBe(1);
  });
});
