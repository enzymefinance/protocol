import { utils } from 'ethers';
import { ChainlinkRateAsset, sighash } from '@enzymefinance/protocol';
import { DeployFunction } from 'hardhat-deploy/types';

import { DeploymentConfig, saveConfig } from '../../utils/config';

// Note that some addresses in this file are checksummed and others are not. This shouldn't be an issue.

// WETH is not included as it is auto-included in the chainlink price feed
const primitives = {
  '1inch': '0x111111111117dc0aa78b770fa6a738034120c302',
  aave: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
  adx: '0xade00c28244d5ce17d72e40330b1c318cd12b7c3',
  alpha: '0xa1faa113cbe53436df28ff0aee54275c13b40975',
  ant: '0xa117000000f279d81a1d3cc75430faa017fa5a2e',
  badger: '0x3472a5a71965499acd81997a54bba8d852c6e53d',
  bal: '0xba100000625a3754423978a60c9317c58a424e3d',
  band: '0xba11d00c5f74255f56a5e366f4f77f5a186d7f55',
  bat: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
  bnb: '0xb8c77482e45f1f44de1745f52c74426c631bdd52',
  bnt: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
  busd: '0x4fabb145d64652a948d72533023f6e7a623c7c53',
  bzrx: '0x56d811088235f11c8920698a204a5010a788f4b3',
  comp: '0xc00e94cb662c3520282e6f5717214004a7f26888',
  cover: '0x4688a8b1f292fdab17e9a90c8bc379dc1dbd8713',
  cro: '0xa0b73e1ff0b80914ab6fe0444e65848c4c34450b',
  crv: '0xd533a949740bb3306d119cc777fa900ba034cd52',
  dai: '0x6b175474e89094c44da98b954eedeac495271d0f',
  dpi: '0x1494ca1f11d487c2bbe4543e90080aeba4ba3c2b',
  enj: '0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c',
  grt: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
  hegic: '0x584bc13c7d411c00c01a62e8019472de68768430',
  knc: '0xdd974d5c2e2928dea5f71b9825b8b646686bd200',
  kncv2: '0xdefa4e8a7bcba345f687a2f1456f5edd9ce97202',
  link: '0x514910771af9ca656af840dff83e8264ecf986ca',
  lrc: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
  mana: '0x0f5d2fb29fb7d3cfee444a200298f468908cc942',
  mkr: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2',
  mln: '0xec67005c4e498ec7f55e092bd1d35cbc47c91892',
  nmr: '0x1776e1f26f98b1a5df9cd347953a26dd3cb46671',
  ogn: '0x8207c1ffc5b6804f6024322ccf34f29c3541ae26',
  orn: '0x0258f474786ddfd37abce6df6bbb1dd5dfc4434a',
  oxt: '0x4575f41308ec1483f3d399aa9a2826d74da13deb',
  perp: '0xbc396689893d065f41bc2c6ecbee5e0085233447',
  ren: '0x408e41876cccdc0f92210600ef50372656052a38',
  repv2: '0x221657776846890989a759ba2973e427dff5c9bb',
  rlc: '0x607f4c5bb672230e8672085532f7e901544a7375',
  rune: '0x3155ba85d5f96b2d030a4966af206230e46849cb',
  snx: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
  susd: '0x57ab1ec28d129707052df4df418d58a2d46d5f51',
  sushi: '0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',
  sxp: '0x8ce9137d39326ad0cd6491fb5cc0cba0e089b6a9',
  uma: '0x04fa0d235c4abf4bcf4787af4cf447de572ef828',
  uni: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  usdt: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  wbtc: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
  wnxm: '0x0d438f3b5175bebc262bf23753c1e53d03432bde',
  yfi: '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e',
  zrx: '0xe41d2489571d322189246dafa5ebde1f4699f498',
} as const;

const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const aggregators = {
  '1inch': ['0x72afaecf99c9d9c8215ff44c77b94b99c28741e8', ChainlinkRateAsset.ETH],
  aave: ['0x6df09e975c830ecae5bd4ed9d90f3a95a4f88012', ChainlinkRateAsset.ETH],
  adx: ['0x231e764b44b2c1b7ca171fa8021a24ed520cde10', ChainlinkRateAsset.USD],
  alpha: ['0x89c7926c7c15fd5bfdb1edcff7e7fc8283b578f6', ChainlinkRateAsset.ETH],
  ant: ['0x8f83670260f8f7708143b836a2a6f11ef0abac01', ChainlinkRateAsset.ETH],
  badger: ['0x58921ac140522867bf50b9e009599da0ca4a2379', ChainlinkRateAsset.ETH],
  bal: ['0xc1438aa3823a6ba0c159cfa8d98df5a994ba120b', ChainlinkRateAsset.ETH],
  band: ['0x919c77acc7373d000b329c1276c76586ed2dd19f', ChainlinkRateAsset.USD],
  bat: ['0x0d16d4528239e9ee52fa531af613acdb23d88c94', ChainlinkRateAsset.ETH],
  bnb: ['0x14e613ac84a31f709eadbdf89c6cc390fdc9540a', ChainlinkRateAsset.USD],
  bnt: ['0xcf61d1841b178fe82c8895fe60c2edda08314416', ChainlinkRateAsset.ETH],
  busd: ['0x614715d2af89e6ec99a233818275142ce88d1cfd', ChainlinkRateAsset.ETH],
  bzrx: ['0x8f7c7181ed1a2ba41cfc3f5d064ef91b67daef66', ChainlinkRateAsset.ETH],
  comp: ['0x1b39ee86ec5979ba5c322b826b3ecb8c79991699', ChainlinkRateAsset.ETH],
  cover: ['0x0ad50393f11ffac4dd0fe5f1056448ecb75226cf', ChainlinkRateAsset.USD],
  cro: ['0xca696a9eb93b81adfe6435759a29ab4cf2991a96', ChainlinkRateAsset.ETH],
  crv: ['0x8a12be339b0cd1829b91adc01977caa5e9ac121e', ChainlinkRateAsset.ETH],
  dai: ['0x773616e4d11a78f511299002da57a0a94577f1f4', ChainlinkRateAsset.ETH],
  dpi: ['0x029849bbc0b1d93b85a8b6190e979fd38f5760e2', ChainlinkRateAsset.ETH],
  enj: ['0x24d9ab51950f3d62e9144fdc2f3135daa6ce8d1b', ChainlinkRateAsset.ETH],
  grt: ['0x17d054ecac33d91f7340645341efb5de9009f1c1', ChainlinkRateAsset.ETH],
  hegic: ['0xbfc189ac214e6a4a35ebc281ad15669619b75534', ChainlinkRateAsset.USD],
  knc: ['0x656c0544ef4c98a6a98491833a89204abb045d6b', ChainlinkRateAsset.ETH],
  kncv2: ['0x656c0544ef4c98a6a98491833a89204abb045d6b', ChainlinkRateAsset.ETH],
  link: ['0xdc530d9457755926550b59e8eccdae7624181557', ChainlinkRateAsset.ETH],
  lrc: ['0x160ac928a16c93ed4895c2de6f81ecce9a7eb7b4', ChainlinkRateAsset.ETH],
  mana: ['0x82a44d92d6c329826dc557c5e1be6ebec5d5feb9', ChainlinkRateAsset.ETH],
  mkr: ['0x24551a8fb2a7211a25a17b1481f043a8a8adc7f2', ChainlinkRateAsset.ETH],
  mln: ['0xdaea8386611a157b08829ed4997a8a62b557014c', ChainlinkRateAsset.ETH],
  nmr: ['0x9cb2a01a7e64992d32a34db7ceea4c919c391f6a', ChainlinkRateAsset.ETH],
  ogn: ['0x2c881b6f3f6b5ff6c975813f87a4dad0b241c15b', ChainlinkRateAsset.ETH],
  orn: ['0xba9b2a360eb8abdb677d6d7f27e12de11aa052ef', ChainlinkRateAsset.ETH],
  oxt: ['0xd75aaae4af0c398ca13e2667be57af2cca8b5de6', ChainlinkRateAsset.USD],
  perp: ['0x3b41d5571468904d4e53b6a8d93a6bac43f02dc9', ChainlinkRateAsset.ETH],
  ren: ['0x3147d7203354dc06d9fd350c7a2437bca92387a4', ChainlinkRateAsset.ETH],
  repv2: ['0xd4ce430c3b67b3e2f7026d86e7128588629e2455', ChainlinkRateAsset.ETH],
  rlc: ['0x4cba1e1fdc738d0fe8db3ee07728e2bc4da676c6', ChainlinkRateAsset.ETH],
  rune: ['0x875d60c44cfbc38baa4eb2ddb76a767deb91b97e', ChainlinkRateAsset.ETH],
  snx: ['0x79291a9d692df95334b1a0b3b4ae6bc606782f8c', ChainlinkRateAsset.ETH],
  susd: ['0x8e0b7e6062272b5ef4524250bfff8e5bd3497757', ChainlinkRateAsset.ETH],
  sushi: ['0xe572cef69f43c2e488b33924af04bdace19079cf', ChainlinkRateAsset.ETH],
  sxp: ['0xfb0cfd6c19e25db4a08d8a204a387cea48cc138f', ChainlinkRateAsset.USD],
  uma: ['0xf817b69ea583caff291e287cae00ea329d22765c', ChainlinkRateAsset.ETH],
  uni: ['0xd6aa3d25116d8da79ea0246c4826eb951872e02e', ChainlinkRateAsset.ETH],
  usdc: ['0x986b5e1e1755e3c2440e960477f25201b0a8bbd4', ChainlinkRateAsset.ETH],
  usdt: ['0xee9f2375b4bdf6387aa8265dd4fb8f16512a1d46', ChainlinkRateAsset.ETH],
  wbtc: ['0xdeb288f737066589598e9214e782fa5a8ed689e8', ChainlinkRateAsset.ETH],
  wnxm: ['0xe5dc0a609ab8bcf15d3f35cfaa1ff40f521173ea', ChainlinkRateAsset.ETH],
  yfi: ['0x7c5d4f8345e66f68099581db340cd65b078c41f4', ChainlinkRateAsset.ETH],
  zrx: ['0x2da4983a622a8498bb1a21fae9d8f6c664939962', ChainlinkRateAsset.ETH],
} as const;

const synths = {
  iaave: '0x176c674ee533c6139b0dc8b458d72a93dcb3e705',
  iada: '0x8a8079c7149b8a1611e5c5d978dca3be16545f83',
  ibnb: '0xafd870f32ce54efdbf677466b612bf8ad164454b',
  ibtc: '0xd6014ea05bde904448b743833ddf07c3c7837481',
  icex: '0x336213e1ddfc69f4701fc3f86f4ef4a160c1159d',
  icomp: '0x6345728b1cce16e6f8c509950b5c84fff88530d9',
  idash: '0xcb98f42221b2c251a4e74a1609722ee09f0cc08e',
  idefi: '0x14d10003807ac60d07bb0ba82caeac8d2087c157',
  idot: '0x46a97629c9c1f58de6ec18c7f536e7e6d6a6ecde',
  ieos: '0xf4eebdd0704021ef2a6bbe993fdf93030cd784b4',
  ietc: '0xd50c1746d835d2770dda3703b69187bffeb14126',
  ieth: '0xa9859874e1743a32409f75bb11549892138bba1e',
  ilink: '0x2d7ac061fc3db53c39fe1607fb8cec1b2c162b01',
  iltc: '0x79da1431150c9b82d2e5dfc1c68b33216846851e',
  ioil: '0xa5a5df41883cdc00c4ccc6e8097130535399d9a3',
  iren: '0x0fed38108bdb8e62ef7b5680e8e0726e2f29e0de',
  itrx: '0xc5807183a9661a533cb08cbc297594a0b864dc12',
  iuni: '0x36a00ff9072570ef4b9292117850b8fe08d96cce',
  ixmr: '0x4adf728e2df4945082cdd6053869f51278fae196',
  ixrp: '0x27269b3e45a4d3e79a3d6bfee0c8fb13d0d711a6',
  ixtz: '0x8deef89058090ac5655a99eeb451a4f9183d1678',
  iyfi: '0x592244301cea952d6dab2fdc1fe6bd9e53917306',
  s1inch: '0xcd39b5434a0a92cf47d1f567a7df84be356814f0',
  saapl: '0x7537aae01f3b218dae75e10d952473823f961b87',
  saave: '0xd2df355c19471c8bd7d8a3aa27ff4e26a21b4076',
  sada: '0xe36e2d3c7c34281fa3bc737950a68571736880a1',
  samzn: '0x9cf7e61853ea30a41b02169391b393b901eac457',
  saud: '0xf48e200eaf9906362bb1442fca31e0835773b8b4',
  sbch: '0x36a2422a863d5b950882190ff5433e513413343a',
  sbnb: '0x617aecb6137b5108d1e7d4918e3725c8cebdb848',
  sbtc: '0xfe18be6b3bd88a2d2a7f928d00292e7a9963cfc6',
  scex: '0xeabacd844a196d7faf3ce596edebf9900341b420',
  schf: '0x0f83287ff768d1c1e17a42f44d644d7f22e8ee1d',
  scomp: '0xeb029507d3e043dd6c87f2917c4e82b902c35618',
  scrv: '0xd38aeb759891882e78e957c80656572503d8c1b1',
  sdash: '0xfe33ae95a9f0da8a845af33516edc240dcd711d6',
  sdefi: '0xe1afe1fd76fd88f78cbf599ea1846231b8ba3b6b',
  sdot: '0x1715ac0743102bf5cd58efbb6cf2dc2685d967b6',
  seos: '0x88c8cf3a212c0369698d13fe98fcb76620389841',
  setc: '0x22602469d704bffb0936c7a7cfcd18f7aa269375',
  seth: '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb',
  seur: '0xd71ecff9342a5ced620049e616c5035f1db98620',
  sfb: '0xf50b5e535f62a56a9bd2d8e2434204e726c027fa',
  sftse: '0x23348160d7f5aca21195df2b70f28fce2b0be9fc',
  sgbp: '0x97fe22e7341a0cd8db6f6c021a24dc8f4dad855f',
  sgoog: '0xc63b8ecce56ab9c46184ec6ab85e4771fea4c8ad',
  sjpy: '0xf6b1c627e95bfc3c1b4c9b825a032ff0fbf3e07d',
  slink: '0xbbc455cb4f1b9e4bfc4b73970d360c8f032efee6',
  sltc: '0xc14103c2141e842e228fbac594579e798616ce7a',
  snflx: '0x5a7e3c07604eb515c16b36cd51906a65f021f609',
  snikkei: '0x757de3ac6b830a931ef178c6634c5c551773155c',
  soil: '0x6d16cf3ec5f763d4d99cb0b0b110eefd93b11b56',
  sren: '0xd31533e8d0f3df62060e94b3f1318137bb6e3525',
  srune: '0x0352557b007a4aae1511c114409b932f06f9e2f4',
  strx: '0xf2e08356588ec5cd9e437552da87c0076b4970b0',
  stsla: '0x918da91ccbc32b7a6a0cc4ecd5987bbab6e31e6d',
  suni: '0x30635297e450b930f8693297eba160d9e6c8ebcf',
  sxag: '0x6a22e5e94388464181578aa7a6b869e00fe27846',
  sxau: '0x261efcdd24cea98652b9700800a13dfbca4103ff',
  sxmr: '0x5299d6f7472dcc137d7f3c4bcfbbb514babf341a',
  sxrp: '0xa2b0fde6d710e201d0d608e924a484d1a5fed57c',
  sxtz: '0x2e59005c5c0f0a4d77cca82653d48b46322ee5cd',
  syfi: '0x992058b7db08f9734d84485bfbc243c4ee6954a7',
} as const;

const ctokens = {
  cbat: '0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e',
  ccomp: '0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4',
  cdai: '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643',
  cuni: '0x35a18000230da775cac24873d00ff85bccded550',
  cusdc: '0x39aa39c021dfbae8fac545936693ac917d5e7563',
  cusdt: '0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9',
  cwbtc: '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4',
  czrx: '0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407',
} as const;

const atokens = {
  aaave: ['0xffc97d72e13e01096502cb8eb52dee56f74dad7b', primitives.aave],
  abal: ['0x272f97b7a56a387ae942350bbc7df5700f8a4576', primitives.bal],
  abusd: ['0xa361718326c15715591c299427c62086f69923d9', primitives.busd],
  acrv: ['0x8dae6cb04688c62d939ed9b68d32bc62e49970b1', primitives.crv],
  adai: ['0x028171bca77440897b824ca71d1c56cac55b68a3', primitives.dai],
  aenj: ['0xac6df26a590f08dcc95d5a4705ae8abbc88509ef', primitives.enj],
  aknc: ['0x39c6b3e42d6a679d7d776778fe880bc9487c2eda', primitives.knc],
  alink: ['0xa06bc25b5805d5f8d82847d191cb4af5a3e873e0', primitives.link],
  amana: ['0xa685a61171bb30d4072b338c80cb7b2c865c873e', primitives.mana],
  amkr: ['0xc713e5e149d5d0715dcd1c156a020976e7e56b88', primitives.mkr],
  aren: ['0xcc12abe4ff81c9378d670de1b57f8e0dd228d77a', primitives.ren],
  asnx: ['0x35f6b052c598d933d69a4eec4d04c73a191fe6c2', primitives.snx],
  asusd: ['0x6c5024cd4f8a59110119c56f8933403a539555eb', primitives.susd],
  auni: ['0xb9d7cb55f463405cdfbe4e90a6d2df01c2b92bf1', primitives.uni],
  ausdc: ['0xbcca60bb61934080951369a648fb03df4f96263c', primitives.usdc],
  ausdt: ['0x3ed3b47dd13ec9a98b44e6204a523e766b225811', primitives.usdt],
  awbtc: ['0x9ff58f4ffb29fa2266ab25e75e2a8b3503311656', primitives.wbtc],
  aweth: ['0x030ba81f1c18d280636f32af80b9aad02cf0854e', weth],
  ayfi: ['0x5165d24277cd063f5ac44efd447b27025e888f37', primitives.yfi],
  azrx: ['0xdf7ff54aacacbff42dfe29dd6144a69b629f8c9e', primitives.zrx],
} as const;

const pools = {
  '1inchWeth': '0x26aad2da94c59524ac0d93f6d6cbf9071d7086f2',
  aaveWeth: '0xdfc14d2af169b0d36c4eff567ada9b2e0cae044f',
  adxWeth: '0xd3772a963790fede65646cfdae08734a17cd0f47',
  antWeth: '0x9def9511fec79f83afcbffe4776b1d817dc775ae',
  balWeth: '0xa70d458a4d9bc0e6571565faee18a48da5c0d593',
  bandWeth: '0xf421c3f2e695c2d4c0765379ccace8ade4a480d9',
  batWeth: '0xb6909b960dbbe7392d405429eb2b3649752b4838',
  bntWeth: '0x3fd4cf9303c4bc9e13772618828712c8eac7dd2f',
  busdUsdc: '0x524847c615639e76fe7d0fe0b16be8c4eac9cf3c',
  busdUsdt: '0xa0abda1f980e03d7eadb78aed8fc1f2dd0fe83dd',
  bzrxWeth: '0xb9b752f7f4a4680eeb327ffe728f46666763a796',
  compWeth: '0xcffdded873554f362ac02f8fb1f02e5ada10516f',
  coverWeth: '0x84e99ccc19da8290a754cb015ca188676d695f0a',
  croWeth: '0x90704ac59e7e54632b0cc9d22573aecd7eb094ad',
  daiUsdc: '0xae461ca67b15dc8dc81ce7615e0320da1a9ab8d5',
  daiUsdt: '0xb20bd5d04be54f870d5c0d3ca85d82b34b836405',
  daiWeth: '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11',
  hegicWeth: '0x1273ad5d8f3596a7a39efdb5a4b8f82e8f003fc3',
  linkWeth: '0xa2107fa5b38d9bbd2c461d6edf11b11a50f6b974',
  lrcWeth: '0x8878df9e1a7c87dcbf6d3999d997f262c05d8c70',
  manaWeth: '0x11b1f53204d03e5529f09eb3091939e4fd8c9cf3',
  mkrWeth: '0xc2adda861f89bbb333c90c492cb837741916a225',
  nmrWeth: '0xb784ced6994c928170b417bbd052a096c6fb17e2',
  ognWeth: '0xce2cc0513634cef3a7c9c257e294ef5e3092f185',
  ornWeth: '0x6c8b0dee9e90ea9f790da5daf6f5b20d23b39689',
  oxtWeth: '0x9b533f1ceaa5ceb7e5b8994ef16499e47a66312d',
  renWeth: '0x8bd1661da98ebdd3bd080f0be4e6d9be8ce9858c',
  repv2Weth: '0x8979a3ef9d540480342ac0f56e9d4c88807b1cba',
  rlcWeth: '0x6d57a53a45343187905aad6ad8ed532d105697c1',
  snxWeth: '0x43ae24960e5534731fc831386c07755a2dc33d47',
  susdWeth: '0xf80758ab42c3b07da84053fd88804bcb6baa4b5c',
  sushiWeth: '0xce84867c3c02b05dc570d0135103d3fb9cc19433',
  sxpWeth: '0xac317d14738a454ff20b191ba3504aa97173045b',
  umaWeth: '0x88d97d199b9ed37c29d846d00d443de980832a22',
  uniWeth: '0xd3d2e2692501a5c9ca623199d38826e513033a17',
  usdcUsdt: '0x3041cbd36888becc7bbcbc0045e3b1f144466f5f',
  usdcWeth: '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc',
  wbtcUsdc: '0x004375dff511095cc5a197a54140a24efef3a416',
  wbtcWeth: '0xbb2b8038a1640196fbe3e38816f3e67cba72d940',
  wethCrv: '0x3da1313ae46132a397d90d95b1424a9a7e3e0fce',
  wethEnj: '0xe56c60b5f9f7b5fc70de0eb79c6ee7d00efa2625',
  wethKnc: '0xf49c43ae0faf37217bdcb00df478cf793edd6687',
  wethMln: '0x15ab0333985fd1e289adf4fbbe19261454776642',
  wethSteth: '0x448a0a42f55142971bb3ea45e64528d3e4114f9e',
  wethUsdt: '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852',
  wethZrx: '0xc6f348dd3b91a56d117ec0071c1e9b83c0996de4',
  wnxmWeth: '0x23bff8ca20aac06efdf23cee3b8ae296a30dfd27',
  yfiWeth: '0x2fdbadf3c4d5a8666bc06645b8358ab803996e28',
} as const;

const ethUsdAggregator = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
const xauUsdAggregator = '0x214eD9Da11D2fbe465a6fc601a91E62EbEc1a0D6';

const curveMinter = '0xd061D61a4d941c39E5453435B6345Dc261C2fcE0';
const synthetixDelegateApprovals = '0x15fd6e554874B9e70F832Ed37f231Ac5E142362f';

// prettier-ignore
const mainnetConfig: DeploymentConfig = {
  aave: {
    atokens,
    lendingPoolAddressProvider: '0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5',
    protocolDataProvider: '0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d',
  },
  alphaHomoraV1: {
    ibeth: '0x67B66C99D3Eb37Fa76Aa3Ed1ff33E8e39F0b9c7A'
  },
  chainlink: {
    aggregators,
    ethusd: ethUsdAggregator,
  },
  compound: {
    ceth: '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5',
    ctokens,
  },
  curve: {
    addressProvider: '0x0000000022D53366457F9d5E68Ec105046FC4383',
    minter: curveMinter,
    pools: {
      aave: {
        invariantProxyAsset: primitives.usdc,
        liquidityGaugeToken: '0xd662908ADA2Ea1916B3318327A97eB18aD588b5d',
        lpToken: '0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900',
        pool: '0xDeBF20617708857ebe4F679508E7b7863a8A8EeE'
      },
      seth: {
        invariantProxyAsset: weth,
        liquidityGaugeToken: '0x3C0FFFF15EA30C35d7A85B85c0782D6c94e1d238',
        lpToken: '0xA3D87FffcE63B53E0d54fAa1cc983B7eB0b74A9c',
        pool: '0xc5424B857f758E906013F3555Dad202e4bdB4567'
      },
      steth: {
        invariantProxyAsset: weth,
        liquidityGaugeToken: '0x182B723a58739a9c974cFDB385ceaDb237453c28',
        lpToken: '0x06325440D014e39736583c165C2963BA99fAf14E',
        pool: '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022'
      },
    },
  },
  idle: {
    bestYieldIdleDai: '0x3fE7940616e5Bc47b0775a0dccf6237893353bB4',
    bestYieldIdleUsdc: '0x5274891bEC421B39D23760c04A6755eCB444797C',
    bestYieldIdleUsdt: '0xF34842d05A1c888Ca02769A633DF37177415C2f8',
    bestYieldIdleSusd: '0xf52cdcd458bf455aed77751743180ec4a595fd3f',
    bestYieldIdleTusd: '0xc278041fDD8249FE4c1Aad1193876857EEa3D68c',
    bestYieldIdleWbtc: '0x8C81121B15197fA0eEaEE1DC75533419DcfD3151',
    riskAdjustedIdleDai: '0xa14eA0E11121e6E951E87c66AFe460A00BCD6A16',
    riskAdjustedIdleUsdc: '0x3391bc034f2935ef0e1e41619445f998b2680d35',
    riskAdjustedIdleUsdt: '0x28fAc5334C9f7262b3A3Fe707e250E01053e07b5',
  },
  kyber: {
    networkProxy: '0x9AAb3f75489902f3a48495025729a0AF77d4b11e',
  },
  lido: {
    steth: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84'
  },
  paraSwapV4: {
    augustusSwapper: '0x1bD435F3C054b6e901B7b108a0ab7617C808677b',
    tokenTransferProxy: '0xb70Bc06D2c9Bf03b3373799606dc7d39346c06B3',
  },
  policies: {
    guaranteedRedemption: {
      redemptionWindowBuffer: 300,
    },
  },
  primitives,
  stakehound: {
    steth: '0xdfe66b14d37c77f4e9b180ceb433d1b164f0281d'
  },
  synthetix: {
    addressResolver: '0x4E3b31eB0E5CB73641EE1E65E7dCEFe520bA3ef2',
    delegateApprovals: synthetixDelegateApprovals,
    originator: '0x1ad1fc9964c551f456238Dd88D6a38344B5319D7',
    snx: primitives.snx,
    susd: primitives.susd,
    synths,
    trackingCode: '0x454e5a594d450000000000000000000000000000000000000000000000000000',
  },
  uniswap: {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    pools,
    router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  },
  wdgld: {
    ethusd: ethUsdAggregator,
    wdgld: '0x123151402076fc819B7564510989e475c9cD93CA',
    xauusd: xauUsdAggregator,
  },
  weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  zeroex: {
    allowedMakers: [
      '0x56178a0d5F301bAf6CF3e1Cd53d9863437345Bf9',
      '0xe0238DA09Cab56B3066F26F98657DccE801c16B9'
    ],
    exchange: '0x080bf510fcbf18b91105470639e9561022937712',
  },
  vaultCalls: [
    [
      synthetixDelegateApprovals,
      sighash(utils.FunctionFragment.fromString('approveExchangeOnBehalf(address delegate)')),
    ],
    [curveMinter, sighash(utils.FunctionFragment.fromString('mint(address)'))],
    [curveMinter, sighash(utils.FunctionFragment.fromString('mint_many(address[8])'))],
    [curveMinter, sighash(utils.FunctionFragment.fromString('toggle_approve_mint(address)'))]
  ],
}

const fn: DeployFunction = async (hre) => {
  await saveConfig(hre, mainnetConfig);
};

fn.tags = ['Config'];
fn.skip = async (hre) => {
  // Run this only for mainnet & mainnet forks.
  const chain = parseInt(await hre.getChainId());
  return chain !== 31337 && chain !== 1;
};

export default fn;
