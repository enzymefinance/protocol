import { ITestStandardToken, ITestUniswapV2Router } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  createNewFund,
  deployProtocolFixture,
  getAssetBalances,
  getAssetUnit,
  seedAccount,
  uniswapV2TakeOrder,
} from '@enzymefinance/testutils';
import { BigNumber } from 'ethers';

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('adapters', () => {
  // Confirms that approvals from adapters to external protocols work as expected
  it('can swap USDT for WETH via Uniswap', async () => {
    const weth = new ITestStandardToken(fork.config.weth, provider);
    const outgoingAsset = new ITestStandardToken(fork.config.primitives.usdt, provider);
    const incomingAsset = weth;
    const uniswapRouter = new ITestUniswapV2Router(fork.config.uniswap.router, provider);
    const [fundOwner] = fork.accounts;

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: weth,
      fundDeployer: fork.deployment.fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    const path = [outgoingAsset, incomingAsset];
    const outgoingAssetAmount = await getAssetUnit(outgoingAsset);
    const amountsOut = await uniswapRouter.getAmountsOut(outgoingAssetAmount, path);

    const [preTxIncomingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset],
    });

    await seedAccount({ provider, account: vaultProxy, amount: outgoingAssetAmount, token: outgoingAsset });
    await uniswapV2TakeOrder({
      comptrollerProxy,
      fundOwner,
      integrationManager: fork.deployment.integrationManager,
      minIncomingAssetAmount: amountsOut[1],
      outgoingAssetAmount,
      path,
      provider,
      uniswapV2ExchangeAdapter: fork.deployment.uniswapV2ExchangeAdapter,
      vaultProxy,
    });

    const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
      account: vaultProxy,
      assets: [incomingAsset, outgoingAsset],
    });

    const incomingAssetAmount = postTxIncomingAssetBalance.sub(preTxIncomingAssetBalance);

    expect(incomingAssetAmount).toEqBigNumber(amountsOut[1]);
    expect(postTxOutgoingAssetBalance).toEqBigNumber(BigNumber.from(0));
  });
});
