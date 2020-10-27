import {
  AddressLike,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { Dispatcher } from '@melonproject/persistent';
import { constants, providers, Signer, utils } from 'ethers';
import { IERC20Extended } from '../codegen/IERC20Extended';
import { ReleaseDeploymentConfig } from './deployment';
import mainnet from '../mainnet.json';

type MainnetConfig = typeof mainnet;

type MainnetWhales = {
  [TKey in keyof MainnetConfig['whales']]: Signer;
};

type MainnetTokens = {
  [TKey in keyof MainnetConfig['tokens']]: IERC20Extended;
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
  provider: providers.JsonRpcProvider;
  deployer: Signer;
  mgm: Signer;
  dispatcher: Dispatcher;
  accounts: Signer[];
}): Promise<ForkReleaseDeploymentConfig> {
  const whales = Object.entries(mainnet.whales).reduce(
    (carry: MainnetWhales, [key, address]) => {
      const signer = provider.getSigner(address);
      return { ...carry, [key]: signer };
    },
    {} as MainnetWhales,
  );

  const tokens = Object.entries(mainnet.tokens).reduce(
    (carry: MainnetTokens, [key, address]) => {
      const token = new IERC20Extended(address, deployer);
      return { ...carry, [key]: token };
    },
    {} as MainnetTokens,
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
          const token = tokens[symbol as keyof MainnetTokens];
          await makeTokenRich(token, whale, account);
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
    dispatcher: dispatcher.address,
    mln: mainnet.tokens.mln,
    weth: mainnet.tokens.weth,
    registeredVaultCalls: {
      contracts: [],
      selectors: [],
    },
    engine: {
      thawDelay: 10000000000,
    },
    chainlink: {
      ethUsdAggregator: mainnet.chainlinkEthUsdAggregator,
      staleRateThreshold: 259200, // 72 hours
      aggregators: chainlinkAggregators,
      primitives: chainlinkPrimitives,
      rateAssets: chainlinkRateAssets,
    },
    integrationManager: {
      trackedAssetsLimit: 20, // TODO
    },
    integratees: {
      chai: mainnet.chai,
      kyber: mainnet.kyber,
      makerDao: {
        dai: randomAddress(), // TODO
        pot: randomAddress(), // TODO
      },
      uniswapV2: {
        factory: randomAddress(), // TODO
      },
      zeroExV2: {
        exchange: mainnet.zeroExV2.exchange,
        erc20Proxy: mainnet.zeroExV2.erc20Proxy,
      },
    },
  };
}

export async function makeEthRich(sender: Signer, receiver: AddressLike) {
  return sender.sendTransaction({
    to: await resolveAddress(receiver),
    value: utils.parseEther('100'),
  });
}

export async function makeTokenRich(
  token: IERC20Extended,
  sender: Signer,
  receiver: AddressLike,
) {
  // 100 * 10^(decimals)
  const amount = constants.One.mul(10)
    .pow(await token.decimals())
    .mul(100);

  await token.connect(sender).transfer(receiver, amount);
}
