#!/usr/bin/env bash

wget https://github.com/dapphub/ethrun/releases/download/v0.2.4/ethrun-v0.2.4-linux.tar.gz
tar -xvf ethrun-v0.2.4-linux.tar.gz
sudo cp ethrun-v0.2.4-linux.tar.gz /usr/local/bin/ethrun
nix-channel --add https://nix.dapphub.com/pkgs/dapphub
nix-channel --update
nix-env -i seth solc
git clone https://github.com/dapphub/dapp
sudo make link -C dapp

