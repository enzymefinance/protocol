import { randomAddress } from '@enzymefinance/ethers';
import type { WstethPriceFeed } from '@enzymefinance/protocol';
import { ITestLidoSteth, ITestStandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { deployProtocolFixture, getAssetUnit } from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
let wstethPriceFeed: WstethPriceFeed;
let wsteth: ITestStandardToken, steth: ITestStandardToken;

beforeEach(async () => {
  fork = await deployProtocolFixture();

  wstethPriceFeed = fork.deployment.wstethPriceFeed;

  wsteth = new ITestStandardToken(fork.config.lido.wsteth, provider);
  steth = new ITestStandardToken(fork.config.lido.steth, provider);
});

describe('calcUnderlyingValues', () => {
  it('happy path', async () => {
    const wstethAmount = (await getAssetUnit(wsteth)).mul(3);

    expect(await wstethPriceFeed.calcUnderlyingValues.args(wsteth, wstethAmount).call()).toMatchFunctionOutput(
      wstethPriceFeed.calcUnderlyingValues,
      {
        underlyings_: [steth.address],
        underlyingAmounts_: [await new ITestLidoSteth(steth, provider).getPooledEthByShares(wstethAmount)],
      },
    );
  });
});

describe('isSupportedAsset', () => {
  it('unhappy path: not supported asset', async () => {
    expect(await wstethPriceFeed.isSupportedAsset(randomAddress())).toBe(false);
  });

  it('happy path', async () => {
    expect(await wstethPriceFeed.isSupportedAsset(wsteth)).toBe(true);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    // Get value in terms of a USD stablecoin for easy lookup
    const quoteAsset = fork.config.primitives.usdc;
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(wsteth, utils.parseEther('1'), quoteAsset)
      .call();

    // On April 14th, 2023 WSTETH/USD was around $2000.
    expect(canonicalAssetValue).toEqBigNumber('2082935742');
  });
});
