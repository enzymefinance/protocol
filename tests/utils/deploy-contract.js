const fs = require('fs');
const path = require('path');
const web3Utils = require('web3-utils');

const outDir = path.resolve(__dirname, '../../build/contracts');

const defaultOptions = {
  gas: web3Utils.toHex(10000000),
  gasPrice: web3Utils.toHex(5000000000),
  value: web3Utils.toHex(0),
  data: null,
};

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
  const estimatedGas = await transaction.estimateGas({from: sender});
  // TODO: max out at block gas limit dynamically
  return web3Utils.toHex(Math.floor(estimatedGas * 2));
}

const call = async (contract, method=undefined, args=[], opts={}) => {
  try {
    stdout(
      `Calling ${method} at ${contract.options.address}${
          (args.length) ? ` with args [${args}]` : ''
      }`
    )
    const result = await contract.methods[method](...args).call(opts);
    return result;
  } catch (e) {
    // TODO: This is a temporary solution to catch and rethrow non-standard errors.
    console.log("Error method:", method);
    throw new Error(e.toString());
  }
}

// `account` is object of shape {address: x, privateKey: y}
const signAndSendRawTx = async (tx, account) => {
  if (account.privateKey === undefined) {
    return await web3.eth.sendTransaction(tx);
  } else {
    const signed = await web3.eth.accounts.signTransaction(tx, account.privateKey);
    return await web3.eth.sendSignedTransaction(signed.rawTransaction);
  }
}

const send = async (contract, method=undefined, args=[], overrideOpts={}) => {
  console.log('method:', method);
  try {
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
    const receipt = await signAndSendRawTx(tx, account);
    return receipt;
  } catch (e) {
    // TODO: This is a temporary solution to catch and rethrow non-standard errors.
    console.log("Error method:", method);
    throw new Error(e.toString());
  }
}

// TODO: factor out common code between deploy and send
// deploy a contract with some args
const deploy = async (name, args=[], overrideOpts={}, libs=[]) => {
  try {
    const artifact = JSON.parse(
      fs.readFileSync(path.join(outDir, `${name}.json`))
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
        to: null
      }, overrideOpts)
    );

    tx.gas = overrideOpts.gas || await estimateGas(txFunction, tx.from);

    stdout(`Deploying ${name}${(args.length) ? ` with args [${args}]` : '' }`);
    const receipt = await signAndSendRawTx(tx, account);
    contract.options.address = receipt.contractAddress;
    stdout(`Deployed ${name} at ${contract.options.address}`);
    return contract;
  } catch (e) {
    // TODO: This is a temporary solution to catch and rethrow non-standard errors.
    throw new Error(e.toString());
  }
}

module.exports = { call, send, deploy };
