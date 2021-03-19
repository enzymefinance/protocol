import { resolveAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';

const whales = {
  adai: '0x62e41b1185023bcc14a465d350e1dde341557925',
  ausdc: '0x98fa411ab5f0bd2655f2499e35666e83835996bc',
  bat: '0x312da0eae223b2062ecd4d3f3a1100eb7d4414b1',
  bnb: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  bnt: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  comp: '0xC89b6f0146642688bb254bF93C28fcCF1E182C81',
  crv: '0x4ce799e6ed8d64536b67dd428565d52a531b3640',
  dai: '0x16B34Ce9A6a6F7FC2DD25Ba59bf7308E7B38E186',
  knc: '0x986C98AF08AdBB82A8De7c7E88c6e8e4C74105ae',
  ldo: '0x3dba737ccc50a32a1764b493285dd51c8af6c278',
  link: '0xbe6977e08d4479c0a6777539ae0e8fa27be4e9d6',
  mana: '0xefb94ac00f1cee8a89d5c3f49faa799da6f03024',
  mln: '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d',
  rep: '0x409c5ab44f99e778b8f82a3311a05149e5af3c8c',
  ren: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  uni: '0x9f41cecc435101045ea9f41d4ee8c5353f77e5d5',
  usdc: '0xae2d4617c862309a3d75a0ffb358c7a5009c673f',
  usdt: '0x5041ed759dd4afc3a72b8192c143f72f4724081a',
  weth: '0xe08A8b19e5722a201EaF20A6BC595eF655397bd5',
  zrx: '0x206376e8940e42538781cd94ef024df3c1e0fd43',
  cbat: '0x285306442cd985cab2c30515cfdab106fca7bc44',
  ccomp: '0xd74f186194ab9219fafac5c2fe4b3270169666db',
  cdai: '0x2bddEd18E2CA464355091266B7616956944ee7eE',
  ceth: '0xB1AdceddB2941033a090dD166a462fe1c2029484',
  crep: '0xc2386de1b7271a87b416f4605d500846e826a185',
  cuni: '0x78e96be52e38b3fc3445a2ed34a6e586ffab9631',
  cusdc: '0x926e78b8df67e129011750dd7b975f8e50d3d7ad',
  czrx: '0x767ecb395def19ab8d1b2fcc89b3ddfbed28fd6b',
  seth: '0x27cc4d6bc95b55a3a981bf1f1c7261cda7bb0931',
  susd: '0x49BE88F0fcC3A8393a59d3688480d7D253C37D2A',
  lidoSteth: '0x31f644e2dd5d74f5c8d6d9de89dd517474d51800',
} as const;

export type Whale = keyof typeof whales;
export type WhaleSigners<T extends Partial<Whale> = Whale> = Record<T, SignerWithAddress>;

export async function unlockWhale(token: Whale) {
  const address = resolveAddress(whales[token]);
  await provider.send('hardhat_impersonateAccount', [address]);
  return provider.getSignerWithAddress(address);
}

export async function unlockAllWhales() {
  const keys = Object.keys(whales) as Whale[];
  const signers = await Promise.all(keys.map(async (token) => unlockWhale(token)));
  return keys.reduce((carry, key, index) => {
    return { ...carry, [key]: signers[index] };
  }, {} as WhaleSigners);
}

export async function unlockWhales<T extends Whale>(...tokens: T[]) {
  const signers = await Promise.all(tokens.map(async (token) => unlockWhale(token)));
  return tokens.reduce((carry, key, index) => {
    return { ...carry, [key]: signers[index] };
  }, {} as WhaleSigners<T>);
}
