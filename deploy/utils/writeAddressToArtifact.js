const fs = require('fs');
const path = require('path');

const artifactsPath = './out';

// TODO: dirty hack; remove ASAP
module.exports = async (artifactName, address, netId) => {
  const thisArtifactPath = path.join(artifactsPath, `${artifactName}.json`);
  const artifact = JSON.parse(fs.readFileSync(thisArtifactPath));
  artifact.networks[netId] = { address };
  console.log(process.cwd())
  // console.log(artifact)
  console.log('writing to ' + thisArtifactPath)
  fs.writeFileSync(thisArtifactPath, JSON.stringify(artifact));
}
