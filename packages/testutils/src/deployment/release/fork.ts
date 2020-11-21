import {
  AddressLike,
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
  SignerWithAddress,
} from '@crestproject/crestproject';
import { Dispatcher, StandardToken, sighash } from '@melonproject/protocol';
import { constants, utils } from 'ethers';
import { mainnet, MainnetConfig } from '../../mainnet';
import { ReleaseDeploymentConfig } from './deployment';

type MainnetWhales = {
  [TKey in keyof MainnetConfig['whales']]: SignerWithAddress;
};

type MainnetTokens = {
  [TKey in keyof MainnetConfig['tokens']]: StandardToken;
};

type MainnetCompoundTokens = {
  [TKey in keyof MainnetConfig['derivatives']['compound']]: StandardToken;
};

export interface ForkReleaseDeploymentConfig extends ReleaseDeploymentConfig {
  mainnet: MainnetConfig;
  tokens: MainnetTokens;
  whales: MainnetWhales;
}

export async function configureForkRelease({
  provider,
  deployer,
  mgm,
  dispatcher,
  accounts,
}: {
  provider: EthereumTestnetProvider;
  deployer: SignerWithAddress;
  mgm: AddressLike;
  dispatcher: Dispatcher;
  accounts: SignerWithAddress[];
}): Promise<ForkReleaseDeploymentConfig> {
  const whales = await Object.entries(mainnet.whales).reduce((carry: Promise<MainnetWhales>, [key, address]) => {
    return new Promise(async (resolve) => {
      const previous = await carry;
      const signer = await provider.getSignerWithAddress(address);
      await provider.send('hardhat_impersonateAccount', [address]);

      resolve({ ...previous, [key]: signer });
    });
  }, Promise.resolve({}) as Promise<MainnetWhales>);

  const tokens = Object.entries(mainnet.tokens).reduce((carry: MainnetTokens, [key, address]) => {
    const token = new StandardToken(address, deployer);
    return { ...carry, [key]: token };
  }, {} as MainnetTokens);

  const compoundTokens = Object.entries(mainnet.derivatives.compound).reduce(
    (carry: MainnetCompoundTokens, [key, address]) => {
      const token = new StandardToken(address, deployer);
      return { ...carry, [key]: token };
    },
    {} as MainnetCompoundTokens,
  );

  const chainlinkConfig = Object.values(mainnet.chainlinkAggregators);
  const chainlinkRateAssets = chainlinkConfig.map(([, b]) => b as number);
  const chainlinkAggregators = chainlinkConfig.map(([a]) => a as string);
  const chainlinkPrimitives = Object.keys(mainnet.chainlinkAggregators).map(
    (key) => mainnet.tokens[key as keyof typeof mainnet.chainlinkAggregators],
  );

  // Transfer some ether to all whales.
  await Promise.all(
    Object.values(whales).map(async (whale) => {
      await makeEthRich(deployer, whale);
    }),
  );

  // Distribute tokens (from the each whale) to all accounts.
  await Promise.all(
    [...accounts, deployer, mgm].map(async (account) => {
      await Promise.all(
        Object.entries(whales).map(async ([symbol, whale]) => {
          if (Object.keys(tokens).includes(symbol)) {
            const token = tokens[symbol as keyof MainnetTokens];
            await makeTokenRich(token, whale, account);
          } else if (Object.keys(mainnet.derivatives.compound).includes(symbol)) {
            const token = compoundTokens[symbol as keyof MainnetCompoundTokens];
            await makeTokenRich(token, whale, account);
          }
        }),
      );
    }),
  );

  return {
    deployer,
    mgm,
    mainnet,
    tokens,
    whales,
    dispatcher,
    mln: mainnet.tokens.mln,
    weth: mainnet.tokens.weth,
    registeredVaultCalls: {
      contracts: [mainnet.synthetix.delegateApprovals],
      selectors: [sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)'))],
    },
    chainlink: {
      ethUsdAggregator: mainnet.chainlinkEthUsdAggregator,
      staleRateThreshold: 259200, // 72 hours
      aggregators: chainlinkAggregators,
      primitives: chainlinkPrimitives,
      rateAssets: chainlinkRateAssets,
    },
    integrationManager: {
      trackedAssetsLimit: 20,
    },
    derivatives: mainnet.derivatives,
    integratees: {
      kyber: mainnet.kyber,
      synthetix: {
        addressResolver: mainnet.synthetix.addressResolver,
        delegateApprovals: mainnet.synthetix.delegateApprovals,
        exchanger: mainnet.synthetix.exchanger,
        snx: mainnet.synthetix.snx,
        susd: tokens.susd,
        originator: randomAddress(),
        trackingCode: '0x4d454c4f4e000000000000000000000000000000000000000000000000000000',
      },
      makerDao: {
        dai: mainnet.maker.dai,
        pot: mainnet.maker.pot,
      },
      uniswapV2: {
        router: mainnet.uniswapV2.router,
        factory: mainnet.uniswapV2.factory,
      },
      zeroExV2: {
        allowedMakers: [], // TODO
        exchange: mainnet.zeroExV2.exchange,
        erc20Proxy: mainnet.zeroExV2.erc20Proxy,
      },
    },
    policies: {
      guaranteedRedemption: {
        redemptionWindowBuffer: 300, // 5 minutes
      },
    },
  };
}

async function makeEthRich(sender: SignerWithAddress, receiver: AddressLike) {
  return sender.sendTransaction({
    to: resolveAddress(receiver),
    value: utils.parseEther('100'),
  });
}

async function makeTokenRich(token: StandardToken, sender: SignerWithAddress, receiver: AddressLike) {
  // 100 * 10^(decimals)
  const amount = constants.One.mul(10)
    .pow(await token.decimals())
    .mul(100);

  await token.connect(sender).transfer(receiver, amount);
}
