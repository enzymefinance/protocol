const WETH = artifacts.require('WETH');
const MLN = artifacts.require('MLN');
const DAI = artifacts.require('DAI');
const EUR = artifacts.require('EUR');
const KNC = artifacts.require('KNC');
const ZRX = artifacts.require('ZRX');
const UniswapExchange = artifacts.require('UniswapExchange');
const UniswapFactory = artifacts.require('UniswapFactory');

module.exports = async deployer => {
  const uniswapExchangeTemplate = await deployer.deploy(UniswapExchange);
  const uniswapFactory = await deployer.deploy(UniswapFactory);

  await uniswapFactory.initializeFactory(uniswapExchangeTemplate.options.address);

  await uniswapFactory.createExchange(WETH.deployed().options.address);
  await uniswapFactory.createExchange(MLN.deployed().options.address);
  await uniswapFactory.createExchange(DAI.deployed().options.address);
  await uniswapFactory.createExchange(EUR.deployed().options.address);
  await uniswapFactory.createExchange(KNC.deployed().options.address);
  await uniswapFactory.createExchange(ZRX.deployed().options.address);
}
