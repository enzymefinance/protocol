import web3 from "./web3";

async function addToLocalWallet(keystoreJson, password) {
  const account = await web3.eth.accounts.decrypt(keystoreJson, password);
  await web3.eth.accounts.wallet.add(account);
}

export default addToLocalWallet;
