import {deployContract} from "../../lib/contracts";

async function deploy(environment, accounts=[], previous={}) {
  const deployed = {};
  const opts = Object.freeze({from: accounts[0], gas: 1000000});
  switch (environment) {
    case 'development':
      deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
        deployed.MlnToken.address,
        deployed.EthToken.address,
        'ETH token',
        'ETH-T',
        18,
        'ethereum.org',
        mockBytes,
        [mockAddress, mockAddress],
        [],
        [],
        [
          config.protocol.pricefeed.interval,
          config.protocol.pricefeed.validity
        ],
        [
          config.protocol.staking.minimumAmount,
          config.protocol.staking.numOperators,
          config.protocol.staking.unstakeDelay
        ],
        deployed.Governance.address
      ], () => {}, true);
      break;
    case 'kovan-demo':
      deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
        mlnAddr,
        ethTokenAddress,
        'Eth Token',
        'WETH-T',
        18,
        'ethereum.org',
        mockBytes,
        [mockAddress, mockAddress],
        [],
        [],
        [
          config.protocol.pricefeed.interval,
          config.protocol.pricefeed.validity
        ], [
          config.protocol.staking.minimumAmount,
          config.protocol.staking.numOperators,
          config.protocol.staking.unstakeDelay
        ],
        pricefeedUpdaterAddress,
      ], () => {}, true);
      break;
    case 'kovan-competition':
      deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
        mlnAddr,
        ethTokenAddress,
        'Eth Token',
        'WETH-T',
        18,
        'ethereum.org',
        mockBytes,
        [mockAddress, mockAddress],
        [],
        [],
        [
          config.protocol.pricefeed.interval,
          config.protocol.pricefeed.validity
        ], [
          config.protocol.staking.minimumAmount,
          config.protocol.staking.numOperators,
          config.protocol.staking.unstakeDelay
        ],
        pricefeedUpdaterAddress,
      ], () => {}, true);
      break;
    case 'live-competition':
      deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed",
        {from: authority, gas: 6900000 },
        [
          mlnAddr,
          ethTokenAddress,
          'Wrapped Ether token',
          'WETH',
          18,
          mockBytes,
          mockBytes,
          [mockAddress, mockAddress],
          [],
          [],
          [
            config.protocol.pricefeed.interval,
            config.protocol.pricefeed.validity,
          ], [
            config.protocol.staking.minimumAmount,
            config.protocol.staking.numOperators,
            config.protocol.staking.unstakeDelay
          ],
          pricefeedUpdater,  // single address performing update calls instead of multisig
          // deployed.Governance.address,
        ],
        () => {}, true
      );
      break;
  }
  return deployed;
}

export default deploy;

