const WETH = artifacts.require('WETH');
const MLN = artifacts.require('MLN');
const DAI = artifacts.require('DAI');
const EUR = artifacts.require('EUR');
const KNC = artifacts.require('KNC');
const ZRX = artifacts.require('ZRX');
const UniswapExchange = artifacts.require('UniswapExchange');
const UniswapFactory = artifacts.require('UniswapFactory');

module.exports = deployer => {
  deployer.then(async () => {
    const uniswapExchangeTemplate = await deployer.deploy(UniswapExchange);
    const uniswapFactory = await deployer.deploy(UniswapFactory);

    await uniswapFactory.initializeFactory(uniswapExchangeTemplate.address);

    await uniswapFactory.createExchange((await WETH.deployed()).address);
    await uniswapFactory.createExchange((await MLN.deployed()).address);
    await uniswapFactory.createExchange((await DAI.deployed()).address);
    await uniswapFactory.createExchange((await EUR.deployed()).address);
    await uniswapFactory.createExchange((await KNC.deployed()).address);
    await uniswapFactory.createExchange((await ZRX.deployed()).address);
  })
}
