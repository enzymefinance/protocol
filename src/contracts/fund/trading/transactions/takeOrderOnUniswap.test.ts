import { deployAndInitTestEnv } from '~/tests/utils/deployAndInitTestEnv';
import { setupInvestedTestFund } from '~/tests/utils/setupInvestedTestFund';
import { Exchanges, Contracts } from '~/Contracts';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';
import { takeOrderOnUniswap } from './takeOrderOnUniswap';
import createQuantity from '@melonproject/token-math/quantity/createQuantity';
import { getContract } from '~/utils/solidity/getContract';
import {
  power,
  BigInteger,
  subtract,
  QuantityInterface,
  valueIn,
} from '@melonproject/token-math';
import { balanceOf } from '~/contracts/dependencies/token/calls/balanceOf';
import { getUniswapRate } from '~/contracts/exchanges/third-party/uniswap/calls/getUniswapRate';

describe('takeOrderOnUniswap', () => {
  const shared: any = {};

  beforeAll(async () => {
    shared.env = await deployAndInitTestEnv();
    shared.accounts = await shared.env.eth.getAccounts();
    shared.routes = await setupInvestedTestFund(shared.env);
    shared.opts = { from: shared.accounts[0], gas: 8000000 };

    shared.uniswapAddress =
      shared.env.deployment.exchangeConfigs[Exchanges.UniswapFactory].exchange;

    shared.mln = getTokenBySymbol(shared.env, 'MLN');
    shared.mlnContract = await getContract(
      shared.env,
      Contracts.StandardToken,
      shared.mln.address,
    );
    shared.weth = getTokenBySymbol(shared.env, 'WETH');
    shared.wethContract = await getContract(
      shared.env,
      Contracts.StandardToken,
      shared.weth.address,
    );
    shared.eur = getTokenBySymbol(shared.env, 'EUR');
    shared.eurContract = await getContract(
      shared.env,
      Contracts.StandardToken,
      shared.eur.address,
    );

    shared.uniswapFactory = await getContract(
      shared.env,
      Contracts.UniswapFactory,
      shared.uniswapAddress,
    );

    const mlnExchangeAddress = await shared.uniswapFactory.methods
      .getExchange(shared.mln.address)
      .call();
    shared.mlnExchange = await getContract(
      shared.env,
      Contracts.UniswapExchangeTemplate,
      mlnExchangeAddress,
    );

    const eurExchangeAddress = await shared.uniswapFactory.methods
      .getExchange(shared.eur.address)
      .call();
    shared.eurExchange = await getContract(
      shared.env,
      Contracts.UniswapExchangeTemplate,
      eurExchangeAddress,
    );

    const minLiquidity = power(new BigInteger(10), new BigInteger(18));
    const maxTokens = power(new BigInteger(10), new BigInteger(19));
    await shared.mlnContract.methods
      .approve(shared.mlnExchange.options.address, maxTokens)
      .send(shared.opts);
    await shared.mlnExchange.methods
      .addLiquidity(`${minLiquidity}`, `${maxTokens}`, `${maxTokens}`)
      .send({ value: `${minLiquidity}`, ...shared.opts });

    await shared.eurContract.methods
      .approve(shared.eurExchange.options.address, maxTokens)
      .send(shared.opts);
    await shared.eurExchange.methods
      .addLiquidity(`${minLiquidity}`, `${maxTokens}`, `${maxTokens}`)
      .send({ value: `${minLiquidity}`, ...shared.opts });
  });

  it('Swap WETH for MLN', async () => {
    const preFundMln: QuantityInterface = await balanceOf(
      shared.env,
      shared.mln.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    const takerQuantity = createQuantity(shared.weth, 0.1);
    const mlnPrice = await getUniswapRate(
      shared.env,
      shared.env.deployment.exchangeConfigs[Exchanges.UniswapFactory].adapter,
      {
        makerAsset: shared.mln,
        takerAsset: shared.weth,
        takerQuantity,
        targetExchange: shared.uniswapAddress,
      },
    );
    const makerQuantity = valueIn(mlnPrice, takerQuantity); // Min WETH

    const result = await takeOrderOnUniswap(
      shared.env,
      shared.routes.tradingAddress,
      { makerQuantity, takerQuantity },
    );

    const postFundMln: QuantityInterface = await balanceOf(
      shared.env,
      shared.mln.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    expect(subtract(postFundMln.quantity, preFundMln.quantity)).toEqual(
      result.makerQuantity.quantity,
    );
    expect(makerQuantity.quantity).toEqual(result.makerQuantity.quantity);
  });

  it('Swap MLN for WETH', async () => {
    const preFundWeth: QuantityInterface = await balanceOf(
      shared.env,
      shared.weth.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    const takerQuantity = createQuantity(shared.mln, 0.1);
    const invertedMlnPrice = await getUniswapRate(
      shared.env,
      shared.env.deployment.exchangeConfigs[Exchanges.UniswapFactory].adapter,
      {
        makerAsset: shared.weth,
        takerAsset: shared.mln,
        takerQuantity,
        targetExchange: shared.uniswapAddress,
      },
    );
    const makerQuantity = valueIn(invertedMlnPrice, takerQuantity); // Min WETH

    const result = await takeOrderOnUniswap(
      shared.env,
      shared.routes.tradingAddress,
      { makerQuantity, takerQuantity },
    );

    const postFundWeth: QuantityInterface = await balanceOf(
      shared.env,
      shared.weth.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    expect(subtract(postFundWeth.quantity, preFundWeth.quantity)).toEqual(
      result.makerQuantity.quantity,
    );
    expect(makerQuantity.quantity).toEqual(result.makerQuantity.quantity);
  });

  it('Swap MLN for EUR', async () => {
    const preFundEur: QuantityInterface = await balanceOf(
      shared.env,
      shared.eur.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    const takerQuantity = createQuantity(shared.mln, 0.1);
    const eurPriceInMln = await getUniswapRate(
      shared.env,
      shared.env.deployment.exchangeConfigs[Exchanges.UniswapFactory].adapter,
      {
        makerAsset: shared.eur,
        takerAsset: shared.mln,
        takerQuantity,
        targetExchange: shared.uniswapAddress,
      },
    );
    const makerQuantity = valueIn(eurPriceInMln, takerQuantity);

    const result = await takeOrderOnUniswap(
      shared.env,
      shared.routes.tradingAddress,
      { makerQuantity, takerQuantity },
    );

    const postFundEur: QuantityInterface = await balanceOf(
      shared.env,
      shared.eur.address,
      {
        address: shared.routes.vaultAddress,
      },
    );

    expect(subtract(postFundEur.quantity, preFundEur.quantity)).toEqual(
      result.makerQuantity.quantity,
    );
    expect(makerQuantity.quantity).toEqual(result.makerQuantity.quantity);
  });
});
