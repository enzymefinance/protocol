import web3 from "./web3";

async function getSignature(signer, contents) {
  const append = "\x19Ethereum Signed Message:\n32" + contents;
  const sig = await web3.eth.accounts.sign(append, signer);
  return sig;
}

async function getSignatureParameters(signer, contents) {
  const sig = await getSignature(signer, contents);
  return [sig.r, sig.s, sig.v];
}

async function getTermsSignatureParameters(managerAddress) {
  const termsAndConditionsHash =
    "0xAA9C907B0D6B4890E7225C09CBC16A01CB97288840201AA7CDCB27F4ED7BF159";
  return getSignatureParameters(managerAddress, termsAndConditionsHash);
}


export { getSignature, getSignatureParameters, getTermsSignatureParameters }
