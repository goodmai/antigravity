
const sdk = require('./smartcontracts/greenfield-testnet/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js');
const { Client } = sdk.default || sdk;

async function main() {
    const rpcUrl = 'http://127.0.0.1:26750';
    const chainId = '9000';
    const client = Client.create(rpcUrl, chainId);
    
    // We want to see what's being signed.
    // The SDK uses @cosmjs/stargate and @cosmjs/amino under the hood.
    // Greenfield SDK has its own broadcast logic.
    
    console.log('Client created with chainId:', chainId);
    
    // Mock a transaction to see the signing payload
    // We can't easily call broadcast without a real account and sequence number,
    // but we can try to intercept the signing call.
    
    // Greenfield SDK uses EIP712 for ECDSA signing.
    // It usually happens in the 'sign' method of the client or similar.
}

main();
