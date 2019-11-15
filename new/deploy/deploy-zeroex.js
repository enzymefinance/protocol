const fs = require('fs');
const {nab, send} = require('./deploy-contract');

const deploy_in = './deploy_out.json'; // TODO: rename
const deploy_out = './deploy_out.json'; // TODO: rename

const main = async input => {
  const exchange = await nab('Exchange', [], input.zeroex.addr);
  const erc20Proxy = await nab('ERC20Proxy', [], input.zeroex.addr);

  await send(erc20Proxy, 'addAuthorizedAddress', [exchange.options.address]);
  await send(exchange, 'registerAssetProxy', [erc20Proxy.options.address]);
  await send(exchange, 'changeZRXAssetData', [input.tokens.addr.ZRX]);

  return {
    "Exchange": exchange.options.address,
    "ERC20Proxy": erc20Proxy.options.address
  };
}

if (require.main === module) {
  const input = JSON.parse(fs.readFileSync(deploy_in, 'utf8'));
  main(input).then(addrs => {
    const output = Object.assign({}, input);
    output.zeroex.addr = addrs;
    fs.writeFileSync(deploy_out, JSON.stringify(output, null, '  '));
    console.log(`Written to ${deploy_out}`);
    console.log(addrs);
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1) });
}

module.exports = main;
