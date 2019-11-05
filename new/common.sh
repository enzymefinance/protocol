#!/usr/bin/env bash

set -e

trap 'printf "Errored on line $LINENO\n"' ERR

rm -f "$D_OUT" # TODO: make this more sensible

jot() {
  printf "%s\t%s\n" $1 $2 >> $D_OUT
}

# get address from input, or create it
# key to check for in input is inferred to be same as contract name
nab() {
  set -e
  addr=$(jq -r ".$1 // empty" "$D_IN")
  if [[ -z $addr ]]; then
    addr=$(dapp create "${@}")
  fi
  jot $1 $addr
  echo $addr
}

# TODO: make this a mode of above function or something
# key to check for in input is passed explicitly
nabx() {
  set -e
  addr=$(jq -r ".$1 // empty" "$D_IN")
  if [[ -z $addr ]]; then
    addr=$(dapp create "${@:2}")
  fi
  jot $1 $addr
  echo $addr
}
