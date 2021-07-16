import { resolveAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';

const whales = {
  wdgld: '0x9aa65464b4cfbe3dc2bdb3df412aee2b3de86687',
  adai: '0x62e41b1185023bcc14a465d350e1dde341557925',
  ausdc: '0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296',
  bat: '0x12274c71304bc0e6b38a56b94d2949b118feb838',
  bnb: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  bnt: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  comp: '0xC89b6f0146642688bb254bF93C28fcCF1E182C81',
  crv: '0x4ce799e6eD8D64536b67dD428565d52A531B3640',
  dai: '0x16463c0fdb6ba9618909f5b120ea1581618c1b9e',
  knc: '0x9d1167df52328db20d5d77288dce6ae3ef3a3e1f',
  ldo: '0x3dba737ccc50a32a1764b493285dd51c8af6c278',
  link: '0xbe6977e08d4479c0a6777539ae0e8fa27be4e9d6',
  mana: '0xefb94ac00f1cee8a89d5c3f49faa799da6f03024',
  mln: '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d',
  rep: '0xc6a043b07d33b6f30d8cb501026c391cfd25abe1',
  ren: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  uni: '0x47173b170c64d16393a52e6c480b3ad8c302ba1e',
  usdc: '0xae2d4617c862309a3d75a0ffb358c7a5009c673f',
  usdt: '0x5041ed759dd4afc3a72b8192c143f72f4724081a',
  weth: '0xe08A8b19e5722a201EaF20A6BC595eF655397bd5',
  zrx: '0x206376e8940e42538781cd94ef024df3c1e0fd43',
  cbat: '0x285306442cd985cab2c30515cfdab106fca7bc44',
  ccomp: '0xd74f186194ab9219fafac5c2fe4b3270169666db',
  cdai: '0x2bddEd18E2CA464355091266B7616956944ee7eE',
  ceth: '0x8aceab8167c80cb8b3de7fa6228b889bb1130ee8',
  crep: '0xc2386de1b7271a87b416f4605d500846e826a185',
  cuni: '0x8889ff5b6323e71c28c26d2c34b8bb52654f00a6',
  cusdc: '0xb3bd459e0598dde1fe84b1d0a1430be175b5d5be',
  czrx: '0x57ca561798413a20508b6bc997481e784f3e6e5f',
  seth: '0xc34a7c65aa08cb36744bda8eeec7b8e9891e147c',
  seur: '0xe896e539e557bc751860a7763c8dd589af1698ce',
  susd: '0x49BE88F0fcC3A8393a59d3688480d7D253C37D2A',
  lidoSteth: '0x31f644e2dd5d74f5c8d6d9de89dd517474d51800',
  eurs: '0x98ed26de6451db36246672df78ae7c50f2c76f6d',
  idle: '0x34aaa3d5a73d6f9594326d0422ce69748f09b14f',
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
