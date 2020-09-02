import { Signer, utils } from 'ethers';
import { AddressLike, resolveAddress } from '@crestproject/crestproject';
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
  // Assets
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
  // Price feed sources
  async chaiPriceSource(config) {
    return mocks.MockChaiPriceSource.deploy(config.deployer);
  },
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
  // Adapter integratees
  async chaiIntegratee(config, deployment) {
    const tokens = await deployment.tokens;
    return mocks.MockChaiIntegratee.deploy(config.deployer, tokens.dai);
  },
  async kyberIntegratee(config) {
    return mocks.MockKyberIntegratee.deploy(config.deployer, []);
  },
  // Further config
  async makeEveryoneRich(config, deployment) {
    const accounts = (config.accounts ?? []).concat(config.deployer);
    const allTokens = {
      ...(await deployment.tokens),
      chai: await deployment.chaiIntegratee,
    };
    const { weth, ...tokens } = allTokens;

    const integratees = [
      await deployment.kyberIntegratee,
      await deployment.chaiIntegratee,
    ];

    // Make all accounts and integratees rich in WETH and tokens
    await Promise.all<any>([
      ...accounts.map((receiver) => {
        return makeTokenRich(Object.values(tokens), receiver);
      }),
      ...accounts.map((account) => {
        return makeWethRich(weth, account);
      }),
    ]);

    // Make integratees rich in WETH, ETH, and tokens
    await Promise.all<any>([
      integratees.map((receiver) => {
        return Promise.all([
          weth.transfer(receiver, utils.parseEther('100')),
          makeEthRich(config.deployer, receiver),
          makeTokenRich(Object.values(tokens), receiver),
        ]);
      }),
    ]);
  },
});

export async function makeEthRich(sender: Signer, receiver: AddressLike) {
  return sender.sendTransaction({
    to: await resolveAddress(receiver),
    value: utils.parseEther('100'),
  });
}

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
