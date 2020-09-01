import { Signer, utils } from 'ethers';
import { AddressLike } from '@crestproject/crestproject';
import { describeDeployment, mocks } from '@melonproject/utils';

export interface MockDeploymentConfig {
  deployer: Signer;
  accounts?: Signer[];
}

export interface MockDeploymentOutput {
  tokens: Promise<{
    weth: mocks.WETH;
    mln: mocks.MockToken;
    rep: mocks.MockToken;
    knc: mocks.MockToken;
    zrx: mocks.MockToken;
    dai: mocks.MockToken;
  }>;
  kyberIntegratee: Promise<mocks.MockKyberIntegratee>;
  chaiIntegratee: Promise<mocks.MockChaiIntegratee>;
  // kyberPriceSource: Promise<mocks.MockKyberPriceSource>;
  chainlinkPriceSources: Promise<{
    weth: mocks.MockChainlinkPriceSource;
    mln: mocks.MockChainlinkPriceSource;
    rep: mocks.MockChainlinkPriceSource;
    knc: mocks.MockChainlinkPriceSource;
    zrx: mocks.MockChainlinkPriceSource;
    dai: mocks.MockChainlinkPriceSource;
  }>;
  chaiPriceSource: Promise<mocks.MockChaiPriceSource>;
}

export const deployMocks = describeDeployment<
  MockDeploymentConfig,
  MockDeploymentOutput
>({
  async tokens(config) {
    const [weth, mln, rep, knc, zrx, dai] = await Promise.all([
      mocks.WETH.deploy(config.deployer),
      mocks.MockToken.deploy(config.deployer, 'mln', 'MLN', 18),
      mocks.MockToken.deploy(config.deployer, 'rep', 'REP', 18),
      mocks.MockToken.deploy(config.deployer, 'knc', 'KNC', 18),
      mocks.MockToken.deploy(config.deployer, 'zrx', 'ZRX', 18),
      mocks.MockToken.deploy(config.deployer, 'dai', 'DAI', 18),
    ]);

    return { weth, mln, rep, knc, zrx, dai };
  },
  async kyberIntegratee(config) {
    return mocks.MockKyberIntegratee.deploy(config.deployer, []);
  },
  async chaiIntegratee(config, deployment) {
    const tokens = await deployment.tokens;
    return mocks.MockChaiIntegratee.deploy(config.deployer, tokens.dai);
  },
  // async kyberPriceSource(config, deployment) {
  //   const weth = await deployment.weth;
  //   const tokens = Object.values(await deployment.tokens);
  //   const primitives = [weth.address, ...tokens.map((token) => token.address)];
  //   return mocks.MockKyberPriceSource.deploy(config.deployer, primitives, weth);
  // },
  async chainlinkPriceSources(config) {
    const [weth, mln, rep, knc, zrx, dai] = await Promise.all([
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
      mocks.MockChainlinkPriceSource.deploy(config.deployer),
    ]);

    return { weth, mln, rep, knc, zrx, dai };
  },
  async chaiPriceSource(config) {
    return mocks.MockChaiPriceSource.deploy(config.deployer);
  },
  async makeEveryoneRich(config, deployment) {
    const accounts = (config.accounts ?? []).concat(config.deployer);
    const allTokens = {
      ...(await deployment.tokens),
      chai: await deployment.chaiIntegratee,
    };
    const { weth, ...tokens } = allTokens;

    const exchanges = [
      await deployment.kyberIntegratee,
      await deployment.chaiIntegratee,
    ];

    // Make all accounts and exchanges rich so we can test investing & trading.
    await Promise.all<any>([
      ...exchanges.map((receiver) => {
        return makeTokenRich(Object.values(tokens), receiver);
      }),
      ...accounts.map((receiver) => {
        return makeTokenRich(Object.values(tokens), receiver);
      }),
      ...accounts.map((account) => {
        return makeWethRich(weth, account);
      }),
    ]);

    // Send weth to each exchange.
    await Promise.all(
      exchanges.map((exchange) => {
        return weth.transfer(exchange, utils.parseEther('100'));
      }),
    );
  },
});

export async function makeWethRich(weth: mocks.WETH, account: Signer) {
  const connected = weth.connect(account);
  const amount = utils.parseEther('1000');
  return connected.deposit.value(amount).send();
}

export function makeTokenRich(
  tokens: mocks.MockToken[],
  receiver: AddressLike,
) {
  const promises = tokens.map((token) => {
    return token.mintFor(receiver, utils.parseEther('10000'));
  });

  return Promise.all(promises);
}
