const conf = require('../deploy-config.js');
const { assetDataUtils } = require('@0x/order-utils');
const ZeroExV3Exchange = artifacts.require('ZeroExV3Exchange');
const ZeroExV2ERC20Proxy = artifacts.require('ZeroExV2ERC20Proxy'); // TODO: use zeroExV3 version
const ZeroExV3ZrxVault = artifacts.require('ZeroExV3ZrxVault');
const ZeroExV3Staking = artifacts.require('ZeroExV3Staking');
const ZeroExV3StakingProxy = artifacts.require('ZeroExV3StakingProxy');
const ZRX = artifacts.require('ZRX');
const WETH = artifacts.require('WETH');

const zeroAddress = '0x0000000000000000000000000000000000000000'; // TODO: import instead

module.exports = async (deployer, _, accounts) => {
  const primary = accounts[0]
  const chainId = await web3.eth.net.getId();

  const exchange = await deployer.deploy(ZeroExV3Exchange, chainId);
  const erc20Proxy = await deployer.deploy(ZeroExV2ERC20Proxy);

  const zrxVault = await deployer.deploy(
    ZeroExV3ZrxVault, erc20Proxy.address, (await ZRX.deployed()).address
  );
  const staking = await deployer.deploy(
    ZeroExV3Staking, (await WETH.deployed()).address, zrxVault.address
  );
  const stakingProxy = await deployer.deploy(
    ZeroExV3StakingProxy, staking.address
  );

  // Add ERC20Proxy to Exchange
  await erc20Proxy.addAuthorizedAddress(exchange.address);
  await erc20Proxy.addAuthorizedAddress(zrxVault.address);

  const proxyId = await erc20Proxy.getProxyId();
  const currentProxy = await exchange.getAssetProxy(proxyId);
  if (currentProxy === zeroAddress || proxyId === null) { // TODO: check still useful?
    await exchange.registerAssetProxy(erc20Proxy.address);
  }
  // Add Exchange to Staking Proxy contract
  const exchangeValid = await stakingProxy.validExchanges(exchange.address);
  if (!exchangeValid) {
    await stakingProxy.addAuthorizedAddress(primary);

    // Approve exchange via stakingDel, the Staking ABI and the deployed StakingProxy address
    // TODO: replace this line
    const stakingDel = await ZeroExV3Staking.at(stakingProxy.address);
    await stakingDel.addExchangeAddress(exchange.address);
  }
  // Add ProtocolFee collector and multiplier in Exchange
  const protocolFeeCollectorAddress = await exchange.protocolFeeCollector();
  if (protocolFeeCollectorAddress === zeroAddress) {
    await exchange.setProtocolFeeCollectorAddress(
      stakingProxy.address
    );
    await exchange.setProtocolFeeMultiplier(conf.zeroExV3ProtocolFeeMultiplier);
  }

  // Add StakingProxy config to ZrxVault
  const vaultStakingProxyAddress = await zrxVault.stakingProxyAddress();
  if (vaultStakingProxyAddress === zeroAddress) {
    await zrxVault.addAuthorizedAddress(primary);
    await zrxVault.setStakingProxy(stakingProxy.address);
    // NOTE: leaving the below here as they are in 0x's migrations, but they aren't currently necessary
    // await staking.addAuthorizedAddress(primary);
    // await staking.addExchangeAddress(exchange.address);
  }
}
