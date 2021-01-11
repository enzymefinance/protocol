import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { defaultForkDeployment, createNewFund, getAssetBalances, paraswapTakeOrder } from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await provider.snapshot(defaultForkDeployment);

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: config.tokens.weth,
  });

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
  };
}

// HAPPY PATHS

it('works as expected when called by a fund (no network fees)', async () => {
  const {
    config: {
      tokens: { dai: incomingAsset, weth: outgoingAsset },
    },
    deployment: { paraswapAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
  } = await provider.snapshot(snapshot);

  const outgoingAssetAmount = utils.parseEther('1');
  const minIncomingAssetAmount = '1';

  // Define the Paraswap Paths
  // Data taken directly from API: https://paraswapv2.docs.apiary.io/
  // `payload` is hardcoded from the API call
  const paths = [
    {
      to: incomingAsset.address, // dest token or intermediary (i.e., dai)
      totalNetworkFee: 0,
      routes: [
        {
          exchange: '0x3b4503CBA9ADd1194Dd8098440e4Be91c4C37806', // Paraswap's UniswapV2 adapter
          targetExchange: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap Router2
          percent: 5000, // Out of 10000
          payload:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000006b175474e89094c44da98b954eedeac495271d0f',
          networkFee: 0,
        },
        {
          exchange: '0x3b4503CBA9ADd1194Dd8098440e4Be91c4C37806', // Paraswap's UniswapV2 adapter
          targetExchange: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', // Sushiswap contract
          percent: 5000, // Out of 10000
          payload:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000006b175474e89094c44da98b954eedeac495271d0f',
          networkFee: 0,
        },
      ],
    },
  ];

  // Seed fund with more than what will be spent
  const initialOutgoingAssetBalance = outgoingAssetAmount.mul(2);
  await outgoingAsset.transfer(vaultProxy, initialOutgoingAssetBalance);

  // TODO: can call multiSwap() first to get the expected amount

  // Execute the take order
  await paraswapTakeOrder({
    comptrollerProxy,
    integrationManager,
    fundOwner,
    paraswapAdapter,
    outgoingAsset,
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount,
    paths,
  });

  // Calculate the fund balances after the tx and assert the correct final token balances
  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });
  expect(postTxOutgoingAssetBalance).toEqBigNumber(initialOutgoingAssetBalance.sub(outgoingAssetAmount));
  expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
});

it('refunds unused network fees', async () => {
  const {
    config: {
      tokens: { dai: incomingAsset, weth: outgoingAsset },
    },
    deployment: { paraswapAdapter, integrationManager },
    fund: { comptrollerProxy, fundOwner, vaultProxy },
  } = await provider.snapshot(snapshot);

  const outgoingAssetAmount = utils.parseEther('1');
  const minIncomingAssetAmount = '1';

  // Define the Paraswap Paths
  // Data taken directly from API: https://paraswapv2.docs.apiary.io/
  // `payload` is hardcoded from the API call
  const totalNetworkFee = utils.parseEther('0.1'); // THIS WILL BE UNUSED
  const paths = [
    {
      to: incomingAsset.address, // dest token or intermediary (i.e., dai)
      totalNetworkFee,
      routes: [
        {
          exchange: '0x3b4503CBA9ADd1194Dd8098440e4Be91c4C37806', // Paraswap's UniswapV2 adapter
          targetExchange: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap Router2
          percent: 10000, // Out of 10000
          payload:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000006b175474e89094c44da98b954eedeac495271d0f',
          networkFee: 0,
        },
      ],
    },
  ];

  // Seed fund with more than what will be spent
  const initialOutgoingAssetBalance = outgoingAssetAmount.add(totalNetworkFee).mul(2);
  await outgoingAsset.transfer(vaultProxy, initialOutgoingAssetBalance);

  // TODO: can call multiSwap() first to get the expected amount

  // Execute the take order
  await paraswapTakeOrder({
    comptrollerProxy,
    integrationManager,
    fundOwner,
    paraswapAdapter,
    outgoingAsset,
    outgoingAssetAmount,
    incomingAsset,
    minIncomingAssetAmount,
    paths,
  });

  // Calculate the fund balances after the tx and assert the correct final token balances
  const [postTxIncomingAssetBalance, postTxOutgoingAssetBalance] = await getAssetBalances({
    account: vaultProxy,
    assets: [incomingAsset, outgoingAsset],
  });
  // Sent network fees should be refunded to the VaultProxy, so not included here
  expect(postTxOutgoingAssetBalance).toEqBigNumber(initialOutgoingAssetBalance.sub(outgoingAssetAmount));
  expect(postTxIncomingAssetBalance).toBeGtBigNumber(0);
});
