#!/usr/bin/env bash
set -ex

CHAIN_DIR='./utils/chain'

parity --chain $CHAIN_DIR/chainGenesis.json db kill || echo 'No database to delete'
parity --chain $CHAIN_DIR/chainGenesis.json --jsonrpc-apis all &
sleep 3
babel-node tests/beforeTests.js
killall parity

parity \
  --chain $CHAIN_DIR/chainGenesis.json \
  --unlock 0x00248D782B4c27b5C6F42FEB3f36918C24b211A5,0x00660f1C570b9387B9fA57Bbdf6804d82a9FDC53,0x00b71117fff2739e83CaDBA788873AdCe169563B,0x0015248B433A62FB2d17E19163449616510926B6,0x00f18CD3EA9a97828861AC9C965D09B94fcE746E,0x0089C3fB6a503c7a1eAB2D35CfBFA746252aaD15 \
  --password=$CHAIN_DIR/password \
  --force-ui \
  --no-persistent-txqueue \
  --jsonrpc-apis all \
  --reseal-min-period 0 \
  --gas-floor-target 6900000
