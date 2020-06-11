const fs = require('fs');
const path = require('path');
const web3Utils = require('web3-utils');

const outdir = path.resolve(`${__dirname}/../../out`);

const defaultOptions = {
  gas: web3Utils.toHex(10000000),
  gasPrice: web3Utils.toHex(5000000000),
  value: web3Utils.toHex(0),
  data: null,
};

// takes a web3 account object and gets the next nonce
// we manually track the nonce, since remote nodes tend to get out of sync
const getNextNonce = async (account, web3) => {
  const nonceFromTxPool = await web3.eth.getTransactionCount(account.address);
  // if (process.env.LOCAL_CHAIN) {
    return nonceFromTxPool;
  // }
  // if (account.nonce === undefined) {
  //   account.nonce = nonceFromTxPool;
  // }
  // const nextNonce = account.nonce;
  // account.nonce++;
  // return nextNonce;
}

const stdout = msg => {
  process.env.MLN_VERBOSE && console.log(msg);
}

const linkLibs = (bin, libs) => {
  for (const lib of libs) {
    const reg = new RegExp(`_+${lib.name}_+`, 'g');
    if (!web3Utils.isAddress(lib.addr)) {
      console.error(`Invalid library address! Please check the address of the deployed ${lib.name} library`)
      process.exit(1);
    }
    if (!bin.match(reg)) {
      console.error(`Wrong library name! "${lib.name}" library is not included in "${name}" contract.`)
      process.exit(1);
    }
    bin = bin.replace(reg, lib.addr.replace('0x', ''));
  }
  return bin;
}

const estimateGas = async (transaction, sender) => {
  try {
    const estimatedGas = await transaction.estimateGas({from: sender});
    // TODO: max out at block gas limit dynamically
    return web3Utils.toHex(Math.floor(estimatedGas * 2));
  } catch (e) {
    console.error(`Failed during gas estimation:\n ${JSON.stringify(transaction, null, '  ')}`);
    throw(e);
  }
}

const call = async (contract, method=undefined, args=[], opts={}) => {
  stdout(
    `Calling ${method} at ${contract.options.address}${
        (args.length) ? ` with args [${args}]` : ''
    }`
  )
  const result = await contract.methods[method](...args).call(opts);
  return result;
}

// `account` is object of shape {address: x, privateKey: y}
const signAndSendRawTx = async (tx, account, web3) => {
  if (account.privateKey === undefined) {
    return web3.eth.sendTransaction(tx);
  } else {
    const signed = await web3.eth.accounts.signTransaction(tx, account.privateKey);
    return web3.eth.sendSignedTransaction(signed.rawTransaction);
  }
}

const send = async (contract, method=undefined, args=[], overrideOpts={}, web3) => {
  stdout(
    `Sending${
        (method) ? ` ${method}` : ''
    } to ${contract.options.address}${
        (args.length) ? ` with args [${args}]` : ''
    }`
  );

  let account;
  if (overrideOpts.from) {
    account = web3.eth.accounts.wallet[overrideOpts.from];
    // handle case of unlocked account with no private key (ganache)
    if (account === undefined) {
      account = {
        address: overrideOpts.from,
        privateKey: undefined
      }
    }
  } else { // default to first account
    account = web3.eth.accounts.wallet['0'];
  }
  const clonedDefaults = Object.assign({}, defaultOptions);

  const tx = Object.assign(
    clonedDefaults,
    Object.assign({
      from: account.address,
      nonce: await getNextNonce(account, web3),
      to: contract.options.address
    }, overrideOpts)
  );

  if (tx.value) {
    tx.value = web3.utils.toHex(tx.value)
  }

  if (method) { // Not simply sending ETH
    const txFunction = contract.methods[method](...args);
    tx.data = await txFunction.encodeABI();

    tx.gas = overrideOpts.gas || await estimateGas(txFunction, tx.from);
  }
  const receipt = await signAndSendRawTx(tx, account, web3);
  return receipt;
}

// TODO: factor out common code between deploy and send
// deploy a contract with some args
const deploy = async (name, args=[], overrideOpts={}, libs=[], web3) => {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(outdir, `${name}.json`))
  );

  // TODO: maybe can remove linking since we compile/deploy with truffle
  const linkedBin = linkLibs(artifact.bytecode, libs);
  const contract = new web3.eth.Contract(artifact.abi);

  const txFunction = contract.deploy({
    arguments: args,
    data: linkedBin.indexOf('0x') === 0 ? linkedBin : `0x${linkedBin}`
  });

  let account;
  if (overrideOpts.from) {
    account = web3.eth.accounts.wallet[overrideOpts.from];
    // handle case of unlocked account with no private key (ganache)
    if (account === undefined) {
      account = {
        address: overrideOpts.from,
        privateKey: undefined
      }
    }
  } else { // default to first account
    account = web3.eth.accounts.wallet['0'];
  }
  const clonedDefaults = Object.assign({}, defaultOptions);

  const tx = Object.assign(
    clonedDefaults,
    Object.assign({
      data: await txFunction.encodeABI(),
      from: account.address,
      nonce: await getNextNonce(account, web3),
      to: null
    }, overrideOpts)
  );

  tx.gas = overrideOpts.gas || await estimateGas(txFunction, tx.from);

  stdout(`Deploying ${name}${(args.length) ? ` with args [${args}]` : '' }`);
  const receipt = await signAndSendRawTx(tx, account, web3);
  contract.options.address = receipt.contractAddress;
  stdout(`Deployed ${name} at ${contract.options.address}`);
  return contract;
}

// get a contract with some address
// TODO: broken since we started using truffle; delete when merging
const fetchContract = (name, address, web3) => {
  const abi = JSON.parse(fs.readFileSync(`${outdir}/${name}.json`, 'utf8')).abi;
  stdout(`Fetching ${name} at ${address}`);
  const contract = new web3.eth.Contract(abi, address);
  return contract;
}

// get address from deploy input if we have one
// otherwise deploy it with args
// TODO: broken since we started using truffle; delete when merging
// TODO: better document
const nab = async (name, args, input, explicitKey=null, libs=[], web3) => {
  let contract;
  const key = explicitKey || name;
  if (input[key] === '' || input[key] === undefined) {
    contract = await deploy(name, args, {}, libs);
  } else {
    contract = fetchContract(name, input[key], web3);
  }
  return contract;
}

module.exports = { call, send, deploy, fetchContract, nab };
