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
    link: fork.config.primitives.link,
    mana: fork.config.primitives.mana,
    mln: fork.config.primitives.mln,
    rep: fork.config.primitives.rep,
    ren: fork.config.primitives.ren,
    susd: fork.config.primitives.susd,
    uni: fork.config.primitives.uni,
    usdc: fork.config.primitives.usdc,
    usdt: fork.config.primitives.usdt,
    weth: fork.config.weth,
    zrx: fork.config.primitives.zrx,
    // aTokens
    ausdc: fork.config.aave.atokens.ausdc[0],
    // cTokens
    ccomp: fork.config.compound.ctokens.ccomp,
    cdai: fork.config.compound.ctokens.cdai,
    ceth: fork.config.compound.ceth,
    cuni: fork.config.compound.ctokens.cuni,
    cusdc: fork.config.compound.ctokens.cusdc,
    // ptTokens
    ptUsdc: fork.config.poolTogetherV4.ptTokens.ptUsdc[0],
    // synths
    seth: fork.config.synthetix.synths.seth,
    seur: fork.config.synthetix.synths.seur,
    // misc
    lidoSteth: fork.config.lido.steth,
    // Not supported assets, so no price lookups
    // ldo: '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
    // eurs: fork.config.unsupportedAssets.eurs,
    // sxag: fork.config.synthetix.synths.sxag - 0x6a22e5e94388464181578aa7a6b869e00fe27846
    // sxau: fork.config.synthetix.synths.sxau - 0x261efcdd24cea98652b9700800a13dfbca4103ff
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
