import web3 from "./web3";


async function getSignature(signer, contents) {
  return web3.eth.sign(contents, signer);
}

async function getSignatureParameters(signer, contents) {
  let sig = await getSignature(signer, contents);
  sig = sig.substr(2,);
  const r = `0x${sig.substr(0, 64)}`;
  const s = `0x${sig.substr(64, 64)}`;
  const v = parseInt(sig.substr(128, 2), 16);
  return [r, s, v];
}

async function getTermsSignatureParameters(managerAddress) {
  const termsAndConditionsHash =
    "0xD35EBA0B0FF284A240D50F43381D8A1E00F19FBFDBF5162224335251A7D6D154";
  return getSignatureParameters(managerAddress, termsAndConditionsHash);
}

export {
  getSignature,
  getSignatureParameters,
  getTermsSignatureParameters
}
