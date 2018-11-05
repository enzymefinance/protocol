#!/usr/bin/env bash
set -ex

# PARITY_VERSION=1.8.10

# install dependencies and compiler
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo apt-get update
sudo apt-get install ethereum software-properties-common openssl libssl-dev libudev-dev solc snapd

# install parity
# sudo snap install parity
# PARITY_DOWNLOAD=https://parity-downloads-mirror.parity.io/v${PARITY_VERSION}/x86_64-unknown-linux-gnu/parity

# Fetch parity
# curl -L $PARITY_DOWNLOAD > parity

# Install parity
# chmod +x parity
# sudo mv parity /usr/bin

# install oyente
# sudo pip2 install z3-solver
# sudo pip2 install web3==2.7.0
# sudo pip2 install oyente
