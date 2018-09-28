import {deployContract} from "../../lib/contracts";
import {newMockAddress, newMockBytes32} from "../../lib/mocks";
import web3 from "../../lib/web3";
import * as masterConfig from "../../config/environment";

async function deploy(environment, previous={}) {
  const deployed = {};
  const config = masterConfig[environment];
  const mockBytes32 = newMockBytes32();
  const mockAddress = newMockAddress();
  switch (environment) {
    case 'development':
      const accounts = await web3.eth.getAccounts();
      const opts = Object.freeze({from: accounts[0], gas: 7000000});
      deployed.CanonicalPriceFeed = await deployContract("pricefeeds/CanonicalPriceFeed", opts, [
        previous.MlnToken.options.address,
        previous.EthToken.options.address,
        web3.utils.padLeft(web3.utils.toHex('ETH token'), 34),
        web3.utils.padLeft(web3.utils.toHex('ETH-T'), 10),
        18,
        'ethereum.org',
        mockBytes32,
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
        previous.Governance.options.address
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
  return Object.assign(previous, deployed);
}

export default deploy;

