#!/usr/bin/env bash
set -ex

PARITY_VERSION=1.8.10

# install dependencies and compiler
sudo add-apt-repository -y ppa:ethereum/ethereum
sudo apt-get update
sudo apt-get install ethereum software-properties-common openssl libssl-dev libudev-dev solc snapd

# install parity
sudo snap install parity
# PARITY_DOWNLOAD=https://parity-downloads-mirror.parity.io/v${PARITY_VERSION}/x86_64-unknown-linux-gnu/parity

# Fetch parity
# curl -L $PARITY_DOWNLOAD > parity

# Install parity
# chmod +x parity
# sudo mv parity /usr/bin

# install dapp
wget https://github.com/dapphub/ethrun/releases/download/v0.2.4/ethrun-v0.2.4-linux.tar.gz
tar -xvf ethrun-v0.2.4-linux.tar.gz
sudo cp ethrun /usr/local/bin/

curl https://nixos.org/nix/install | sh
source $HOME/.nix-profile/etc/profile.d/nix.sh
nix-channel --add https://nix.dapphub.com/pkgs/dapphub
nix-channel --update
nix-env -iA dapphub.{dapp,hevm,seth}

# install oyente
sudo pip2 install z3
sudo pip2 install z3-solver
sudo pip2 install oyente
