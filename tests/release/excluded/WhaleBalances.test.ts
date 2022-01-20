import { StandardToken } from '@enzymefinance/protocol';
import { getAssetUnit } from '@enzymefinance/testutils';

it('whales have adequate balances', async () => {
  /* eslint-disable sort-keys-fix/sort-keys-fix */
  const whaleTokenAddresses = {
    // primitives
    bat: fork.config.primitives.bat,
    bnb: fork.config.primitives.bnb,
    bnt: fork.config.primitives.bnt,
    comp: fork.config.primitives.comp,
    dai: fork.config.primitives.dai,
    knc: fork.config.primitives.knc,
    ldo: fork.config.primitives.ldo,
    link: fork.config.primitives.link,
    mana: fork.config.primitives.mana,
    mln: fork.config.primitives.mln,
    ohm: fork.config.primitives.ohm,
    rep: fork.config.primitives.rep,
    ren: fork.config.primitives.ren,
    sohm: fork.config.primitives.sohm,
    susd: fork.config.primitives.susd,
    uni: fork.config.primitives.uni,
    usdc: fork.config.primitives.usdc,
    usdt: fork.config.primitives.usdt,
    weth: fork.config.weth,
    zrx: fork.config.primitives.zrx,
    // aTokens
    ausdc: fork.config.aave.atokens.ausdc[0],
    ausdt: fork.config.aave.atokens.ausdt[0],
    // cTokens
    ccomp: fork.config.compound.ctokens.ccomp,
    cdai: fork.config.compound.ctokens.cdai,
    ceth: fork.config.compound.ceth,
    cuni: fork.config.compound.ctokens.cuni,
    cusdc: fork.config.compound.ctokens.cusdc,
    // ptTokens
    ptUsdc: fork.config.poolTogetherV4.ptTokens.ptUsdc[0],
    // synths
    // misc
    lidoSteth: fork.config.lido.steth,
    // Not supported assets, so no price lookups
    // seth: fork.config.unsupportedAssets.seth
    // sxag: 0x6a22e5e94388464181578aa7a6b869e00fe27846
    // sxau: 0x261efcdd24cea98652b9700800a13dfbca4103ff
    // ust: 0xa47c8bf37f92abed4a126bda807a7b7498661acd
  };
  /* eslint-enable sort-keys-fix/sort-keys-fix */

  const usdc = new StandardToken(fork.config.primitives.usdc, provider);
  const whaleValueTarget = (await getAssetUnit(usdc)).mul(10000);
  for (const [symbol, tokenAddress] of Object.entries(whaleTokenAddresses)) {
    const token = new StandardToken(tokenAddress, provider);
    const whaleAddress = whales[symbol as keyof typeof whales];
    const whaleBalance = await token.balanceOf(whaleAddress);
    const whaleValue = await fork.deployment.valueInterpreter.calcCanonicalAssetValue
      .args(tokenAddress, whaleBalance, usdc)
      .call();
    if (whaleValue.lt(whaleValueTarget)) {
      console.log('Whale balance low:', symbol);
    }
  }
});
