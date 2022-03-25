import type { AddressLike } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, ValueInterpreter } from '@enzymefinance/protocol';
import {
  ONE_DAY_IN_SECONDS,
  ONE_HOUR_IN_SECONDS,
  pricelessAssetBypassStartAssetBypassTimelockSelector,
  StandardToken,
  TestPricelessAssetBypassMixin,
  vaultCallAnyDataHash,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertNoEvent,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  transactionTimestamp,
  vaultCallStartAssetBypassTimelock,
} from '@enzymefinance/testutils';
import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';

const timelockDuration = ONE_DAY_IN_SECONDS * 7;
const timeLimitDuration = ONE_DAY_IN_SECONDS * 2;

let fork: ProtocolDeployment;
let testPricelessAssetBypassMixin: TestPricelessAssetBypassMixin;
let comptrollerProxy: ComptrollerLib;
let fundOwner: SignerWithAddress;
let denominationAsset: StandardToken, assetToBypass: StandardToken;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;
  testPricelessAssetBypassMixin = await TestPricelessAssetBypassMixin.deploy(
    fork.deployer,
    fork.deployment.valueInterpreter,
    fork.config.weth,
    timelockDuration,
    timeLimitDuration,
  );

  // Register the vault call to startAssetBypassTimelock() on the test contract
  await fork.deployment.fundDeployer.registerVaultCalls(
    [testPricelessAssetBypassMixin],
    [pricelessAssetBypassStartAssetBypassTimelockSelector],
    [vaultCallAnyDataHash],
  );

  denominationAsset = new StandardToken(fork.config.primitives.usdc, provider);
  assetToBypass = new StandardToken(fork.config.primitives.dai, provider);

  const newFundRes = await createNewFund({
    denominationAsset,
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
});

describe('constructor', () => {
  it('correctly sets state vars', async () => {
    expect(await testPricelessAssetBypassMixin.getPricelessAssetBypassTimeLimit()).toEqBigNumber(timeLimitDuration);
    expect(await testPricelessAssetBypassMixin.getPricelessAssetBypassTimelock()).toEqBigNumber(timelockDuration);
    expect(await testPricelessAssetBypassMixin.getPricelessAssetBypassValueInterpreter()).toMatchAddress(
      fork.deployment.valueInterpreter,
    );
    expect(await testPricelessAssetBypassMixin.getPricelessAssetBypassWethToken()).toMatchAddress(fork.config.weth);
  });
});

describe('startAssetBypassTimelock', () => {
  it.todo('does not allow a spoofed VaultProxy to call on behalf of a real ComptrollerProxy');

  it('does not allow an asset that has a valid price', async () => {
    await expect(
      vaultCallStartAssetBypassTimelock({
        asset: assetToBypass,
        comptrollerProxy,
        contract: testPricelessAssetBypassMixin,
      }),
    ).rejects.toBeRevertedWith('Asset has a price');
  });

  it('happy path', async () => {
    await fork.deployment.valueInterpreter.removePrimitives([assetToBypass]);

    const receipt = await vaultCallStartAssetBypassTimelock({
      asset: assetToBypass,
      comptrollerProxy,
      contract: testPricelessAssetBypassMixin,
    });

    // Assert state
    expect(
      await testPricelessAssetBypassMixin.getAssetBypassWindowStartForFund(comptrollerProxy, assetToBypass),
    ).toEqBigNumber(BigNumber.from(await transactionTimestamp(receipt)).add(timelockDuration));

    // Assert event
    assertEvent(receipt, testPricelessAssetBypassMixin.abi.getEvent('PricelessAssetTimelockStarted'), {
      asset: assetToBypass,
      comptrollerProxy,
    });
  });
});

describe('assetIsBypassableForFund', () => {
  it('happy path', async () => {
    expect(await testPricelessAssetBypassMixin.assetIsBypassableForFund(comptrollerProxy, assetToBypass)).toBe(false);

    await fork.deployment.valueInterpreter.removePrimitives([assetToBypass]);

    await vaultCallStartAssetBypassTimelock({
      asset: assetToBypass,
      comptrollerProxy,
      contract: testPricelessAssetBypassMixin,
    });

    // Asset should not immediately be bypassable
    expect(await testPricelessAssetBypassMixin.assetIsBypassableForFund(comptrollerProxy, assetToBypass)).toBe(false);

    // One hour before timelock ends, asset should not be bypassable

    await provider.send('evm_increaseTime', [BigNumber.from(timelockDuration).sub(ONE_HOUR_IN_SECONDS).toNumber()]);
    await provider.send('evm_mine', []);

    expect(await testPricelessAssetBypassMixin.assetIsBypassableForFund(comptrollerProxy, assetToBypass)).toBe(false);

    // One hour after the timelock ends, asset should be bypassable
    await provider.send('evm_increaseTime', [ONE_HOUR_IN_SECONDS * 2]);
    await provider.send('evm_mine', []);

    expect(await testPricelessAssetBypassMixin.assetIsBypassableForFund(comptrollerProxy, assetToBypass)).toBe(true);

    // One hour after the bypass window expires, asset should no longer be bypassable
    await provider.send('evm_increaseTime', [timeLimitDuration]);
    await provider.send('evm_mine', []);

    expect(await testPricelessAssetBypassMixin.assetIsBypassableForFund(comptrollerProxy, assetToBypass)).toBe(false);
  });
});

describe('__calcTotalValueExlcudingBypassablePricelessAssets', () => {
  const denominationAssetAmount = 123;
  let assetToBypassAmount: BigNumber;
  let valueInterpreter: ValueInterpreter;
  let assetsToQuery: AddressLike[], assetAmountsToQuery: BigNumberish[];

  beforeEach(async () => {
    valueInterpreter = fork.deployment.valueInterpreter;

    assetToBypassAmount = await getAssetUnit(assetToBypass);

    assetsToQuery = [denominationAsset, assetToBypass];
    assetAmountsToQuery = [denominationAssetAmount, assetToBypassAmount];
  });

  it('does not allow an asset with an invalid price that is not bypassable', async () => {
    await fork.deployment.valueInterpreter.removePrimitives([assetToBypass]);

    await expect(
      testPricelessAssetBypassMixin.calcTotalValueExlcudingBypassablePricelessAssets(
        comptrollerProxy,
        assetsToQuery,
        assetAmountsToQuery,
        denominationAsset,
      ),
    ).rejects.toBeRevertedWith('Invalid asset not bypassable');
  });

  it('happy path: valid assets', async () => {
    const expectedValue = await valueInterpreter.calcCanonicalAssetsTotalValue
      .args(assetsToQuery, assetAmountsToQuery, denominationAsset)
      .call();

    expect(
      await testPricelessAssetBypassMixin.calcTotalValueExlcudingBypassablePricelessAssets
        .args(comptrollerProxy, assetsToQuery, assetAmountsToQuery, denominationAsset)
        .call(),
    ).toEqBigNumber(expectedValue);

    const receipt = await testPricelessAssetBypassMixin.calcTotalValueExlcudingBypassablePricelessAssets(
      comptrollerProxy,
      assetsToQuery,
      assetAmountsToQuery,
      denominationAsset,
    );

    assertNoEvent(receipt, testPricelessAssetBypassMixin.abi.getEvent('PricelessAssetBypassed'));
  });

  it('happy path: bypassable invalid asset', async () => {
    await fork.deployment.valueInterpreter.removePrimitives([assetToBypass]);

    await vaultCallStartAssetBypassTimelock({
      asset: assetToBypass,
      comptrollerProxy,
      contract: testPricelessAssetBypassMixin,
    });

    await provider.send('evm_increaseTime', [timelockDuration]);
    await provider.send('evm_mine', []);

    // Only the denomination asset value should be included
    expect(
      await testPricelessAssetBypassMixin.calcTotalValueExlcudingBypassablePricelessAssets
        .args(comptrollerProxy, assetsToQuery, assetAmountsToQuery, denominationAsset)
        .call(),
    ).toEqBigNumber(denominationAssetAmount);

    const receipt = await testPricelessAssetBypassMixin.calcTotalValueExlcudingBypassablePricelessAssets(
      comptrollerProxy,
      assetsToQuery,
      assetAmountsToQuery,
      denominationAsset,
    );

    assertEvent(receipt, testPricelessAssetBypassMixin.abi.getEvent('PricelessAssetBypassed'), {
      asset: assetToBypass,
      comptrollerProxy,
    });
  });
});

describe('__calcValueExcludingBypassablePricelessAsset', () => {
  let assetToBypassAmount: BigNumber;
  let valueInterpreter: ValueInterpreter;

  beforeEach(async () => {
    valueInterpreter = fork.deployment.valueInterpreter;

    assetToBypassAmount = await getAssetUnit(assetToBypass);
  });

  it('does not allow an asset with an invalid price that is not bypassable', async () => {
    await fork.deployment.valueInterpreter.removePrimitives([assetToBypass]);

    await expect(
      testPricelessAssetBypassMixin.calcValueExcludingBypassablePricelessAsset(
        comptrollerProxy,
        assetToBypass,
        assetToBypassAmount,
        denominationAsset,
      ),
    ).rejects.toBeRevertedWith('Invalid asset not bypassable');
  });

  it('happy path: valid asset', async () => {
    const expectedValue = await valueInterpreter.calcCanonicalAssetValue
      .args(assetToBypass, assetToBypassAmount, denominationAsset)
      .call();

    expect(
      await testPricelessAssetBypassMixin.calcValueExcludingBypassablePricelessAsset
        .args(comptrollerProxy, assetToBypass, assetToBypassAmount, denominationAsset)
        .call(),
    ).toEqBigNumber(expectedValue);

    const receipt = await testPricelessAssetBypassMixin.calcValueExcludingBypassablePricelessAsset(
      comptrollerProxy,
      assetToBypass,
      assetToBypassAmount,
      denominationAsset,
    );

    assertNoEvent(receipt, testPricelessAssetBypassMixin.abi.getEvent('PricelessAssetBypassed'));
  });

  it('happy path: bypassable invalid asset', async () => {
    await fork.deployment.valueInterpreter.removePrimitives([assetToBypass]);

    await vaultCallStartAssetBypassTimelock({
      asset: assetToBypass,
      comptrollerProxy,
      contract: testPricelessAssetBypassMixin,
    });

    await provider.send('evm_increaseTime', [timelockDuration]);
    await provider.send('evm_mine', []);

    expect(
      await testPricelessAssetBypassMixin.calcValueExcludingBypassablePricelessAsset
        .args(comptrollerProxy, assetToBypass, assetToBypassAmount, denominationAsset)
        .call(),
    ).toEqBigNumber(0);

    const receipt = await testPricelessAssetBypassMixin.calcValueExcludingBypassablePricelessAsset(
      comptrollerProxy,
      assetToBypass,
      assetToBypassAmount,
      denominationAsset,
    );

    assertEvent(receipt, testPricelessAssetBypassMixin.abi.getEvent('PricelessAssetBypassed'), {
      asset: assetToBypass,
      comptrollerProxy,
    });
  });
});
