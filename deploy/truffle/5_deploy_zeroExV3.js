const { assetDataUtils } = require('@0x/order-utils');
const ZeroExV3Exchange = artifacts.require('ZeroExV3Exchange');
const ZeroExV3ERC20Proxy = artifacts.require('ZeroExV3ERC20Proxy');
const ZeroExV3ZrxVault = artifacts.require('ZeroExV3ZrxVault');
const ZeroExV3Staking = artifacts.require('ZeroExV3Staking');
const ZeroExV3StakingProxy = artifacts.require('ZeroExV3StakingProxy');

const zeroAddress = '0x0000000000000000000000000000000000000000'; // TODO: import instead

module.exports = async (deployer, _, accounts) => {
  const primary = accounts[0]
  const chainId = await web3.eth.net.getId();

  const exchange = await deployer.deploy(ZeroExV3Exchange, chainId);
  const erc20Proxy = await deployer.deploy(ZeroExV3ERC20Proxy);

  const zrxVault = await deployer.deploy(
    ZeroExV3ZrxVault, erc20Proxy.options.address, ZRX.deployed().options.address
  );
  const staking = await deployer.deploy(
    ZeroExV3Staking, WETH.deployed().options.address, zrxVault.options.address
  );
  const stakingProxy = await deployer.deploy(
    ZeroExV3StakingProxy, staking.options.address
  );

  // Add ERC20Proxy to Exchange
  await erc20Proxy.addAuthorizedAddress(exchange.options.address);
  await erc20Proxy.addAuthorizedAddress(zrxVault.options.address);

  const proxyId = await erc20Proxy.getProxyId();
  const currentProxy = await exchange.getAssetProxy(proxyId]);
  if (currentProxy === zeroAddress || proxyId === null) { // TODO: check still useful?
    await exchange.registerAssetProxy(erc20Proxy.options.address);
  }
  // Add Exchange to Staking Proxy contract
  const exchangeValid = await stakingProxy.validExchanges(exchange.options.address);
  if (!exchangeValid) {
    await stakingProxy.addAuthorizedAddress(primary);

    // Approve exchange via stakingDel, the Staking ABI and the deployed StakingProxy address
    // TODO: replace this line
    const stakingDel = fetchContract('ZeroExV3Staking', stakingProxy.options.address);
    await stakingDel.addExchangeAddress(exchange.options.address);
  }
  // Add ProtocolFee collector and multiplier in Exchange
  const protocolFeeCollectorAddress = await exchange.protocolFeeCollector();
  if (protocolFeeCollectorAddress === zeroAddress) {
    await exchange.setProtocolFeeCollectorAddress(
      stakingProxy.options.address
    );
    await exchange.setProtocolFeeMultiplier(conf.zeroExV3ProtocolFeeMultiplier);
  }

  // Add StakingProxy config to ZrxVault
  const vaultStakingProxyAddress = await zrxVault.stakingProxyAddress();
  if (vaultStakingProxyAddress === zeroAddress) {
    await zrxVault.addAuthorizedAddress(primary);
    await zrxVault.setStakingProxy(stakingProxy.options.address);
    // NOTE: leaving the below here as they are in 0x's migrations, but they aren't currently necessary
    // await staking.addAuthorizedAddress(primary);
    // await staking.addExchangeAddress(exchange.options.address);
  }
}
