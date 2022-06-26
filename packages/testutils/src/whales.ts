import { resolveAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';

const whales = {
  // primitives
  bat: '0x12274c71304bc0e6b38a56b94d2949b118feb838',
  bnb: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  bnt: '0x7d1ed1601a12a172269436fa95fe156650603c1d',
  busd: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503',
  comp: '0x0f50d31b3eaefd65236dd3736b863cffa4c63c4e',
  crv: '0xf89501b77b2fa6329f94f5a05fe84cebb5c8b1a0',
  dai: '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503',
  grt: '0xf977814e90da44bfa03b6295a0616a897441acec',
  knc: '0x09d51654bd9efbfcb56da3491989cc1444095fff',
  ldo: '0x3dba737ccc50a32a1764b493285dd51c8af6c278',
  link: '0xbe6977e08d4479c0a6777539ae0e8fa27be4e9d6',
  lusd: '0x24cbbef882a77c5aaa9abd6558e68b4c648453c5',
  mana: '0xefb94ac00f1cee8a89d5c3f49faa799da6f03024',
  mln: '0xd8f8a53945bcfbbc19da162aa405e662ef71c40d',
  ohm: '0x0d0707963952f2fba59dd06f2b425ace40b492fe',
  rep: '0xc6a043b07d33b6f30d8cb501026c391cfd25abe1',
  ren: '0xbe0eb53f46cd790cd13851d5eff43d12404d33e8',
  susd: '0xcfb87039a1eda5428e2c8386d31ccf121835ecdb',
  sohm: '0x3d5c83351c872fdf07da498c84ca3275222f284c',
  uni: '0x47173b170c64d16393a52e6c480b3ad8c302ba1e',
  usdc: '0xae2d4617c862309a3d75a0ffb358c7a5009c673f',
  usdt: '0x5041ed759dd4afc3a72b8192c143f72f4724081a',
  weth: '0xe08A8b19e5722a201EaF20A6BC595eF655397bd5',
  zrx: '0x206376e8940e42538781cd94ef024df3c1e0fd43',
  // aTokens
  ausdc: '0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296',
  ausdt: '0x7d6149ad9a573a6e2ca6ebf7d4897c1b766841b4',
  // cTokens
  ccomp: '0xd74f186194ab9219fafac5c2fe4b3270169666db',
  cdai: '0x30030383d959675ec884e7ec88f05ee0f186cc06',
  ceth: '0x8aceab8167c80cb8b3de7fa6228b889bb1130ee8',
  cuni: '0x39d8014b4f40d2cbc441137011d32023f4f1fd87',
  cusdc: '0xb3bd459e0598dde1fe84b1d0a1430be175b5d5be',
  // fTokens
  fdai7: '0xa993d62492f41703f6185881eae755b0966ea5b0',
  feth7: '0xd63d406180ea3b47f98422bf5fad902fe6ccfbec',
  fdai8: '0xd6bf9d9079139dbb3a4fdb84b07efc75ea77838f',
  ftribe8: '0xdb5ac83c137321da29a59a7592232bc4ed461730',
  // ptTokens
  ptUsdc: '0x92c48a51df43e0ec3ebc1a53d0e6f8d40f5bacac',
  // synths (unsupported)
  seth: '0xc34a7c65aa08cb36744bda8eeec7b8e9891e147c',
  sxag: '0x40d68c490bf7262ec40048099aec23535f734be2',
  sxau: '0x92eb453b7b5b8d41edb44e2c8b8b53eb70a482c7',
  // misc
  cvx: '0x0aca67fa70b142a3b9bf2ed89a81b40ff85dacdc',
  lidoSteth: '0x6cf9aa65ebad7028536e353393630e2340ca6049',
  usf: '0xe8bb5f49990d16851e86698db621bcc8f834ca1a',
  ust: '0x738cf6903e6c4e699d1c2dd9ab8b67fcdb3121ea',
  // Curve steth pool related
  stecrv: '0x56c915758ad3f76fd287fff7563ee313142fb663',
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
  const initial = {} as WhaleSigners;

  return keys.reduce<WhaleSigners>((carry, key, index) => {
    return { ...carry, [key]: signers[index] };
  }, initial);
}

export async function unlockWhales<T extends Whale>(...tokens: T[]) {
  const signers = await Promise.all(tokens.map(async (token) => unlockWhale(token)));
  const initial = {} as WhaleSigners;

  return tokens.reduce<WhaleSigners<T>>((carry, key, index) => {
    return { ...carry, [key]: signers[index] };
  }, initial);
}
