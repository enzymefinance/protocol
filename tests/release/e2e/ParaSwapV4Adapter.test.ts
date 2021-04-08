import { StandardToken } from '@enzymefinance/protocol';
import {
  createNewFund,
  ProtocolDeployment,
  getAssetBalances,
  deployProtocolFixture,
  paraSwapV4TakeOrder,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

// HAPPY PATHS

// Will not work until bumping the mainnet fork block
xit('works as expected when called by a fund (no network fees)', async () => {
  const outgoingAsset = new StandardToken(fork.config.weth, whales.weth);
  const incomingAsset = new StandardToken(fork.config.primitives.dai, provider);
  const [fundOwner] = fork.accounts;

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    denominationAsset: new StandardToken(fork.config.weth, provider),
    fundDeployer: fork.deployment.fundDeployer,
  });

  const outgoingAssetAmount = utils.parseEther('1');
  const minIncomingAssetAmount = '1';

  // Define the ParaSwap Paths
  // Data taken directly from API: https://paraswapv2.docs.apiary.io/
  // `payload` is hardcoded from the API call
  const paths = [
    {
      to: incomingAsset.address, // dest token or intermediary (i.e., dai)
      totalNetworkFee: 0,
      routes: [
        {
          exchange: '0x695725627E04898Ef4a126Ae71FC30aA935c5fb6', // ParaSwap's UniswapV2 adapter
          targetExchange: '0x86d3579b043585A97532514016dCF0C2d6C4b6a1', // Uniswap Router2
          percent: 5000, // Out of 10000
          payload:
            '0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000006b175474e89094c44da98b954eedeac495271d0f',
          networkFee: 0,
        },
        {
          exchange: '0x77Bc1A1ba4E9A6DF5BDB21f2bBC07B9854E8D1a8', // ParaSwap's Sushiswap adapter
          targetExchange: '0xBc1315CD2671BC498fDAb42aE1214068003DC51e', // Sushiswap contract
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
  await paraSwapV4TakeOrder({
    comptrollerProxy,
    integrationManager: fork.deployment.integrationManager,
    fundOwner,
    paraSwapV4Adapter: fork.deployment.paraSwapV4Adapter,
    outgoingAsset,
    outgoingAssetAmount,
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
