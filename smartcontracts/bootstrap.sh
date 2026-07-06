#!/bin/sh
set -e
export ADDR=$(grep contract_address /shared-config/NodeConfig.toml | cut -d'"' -f2)
echo "Registering dummy account at $ADDR..."
cast send --rpc-url http://chipotle-anvil:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  "$ADDR" "newAccount(uint256,bool,string,string,address)" \
  0x0e5ef0c19efd967e0b52255c37d777366c74b8cdce4b8356a956db1bffc0fbc6 \
  false Dummy "Dummy Account" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
