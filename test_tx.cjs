const { Client, VisibilityType } = require('./smartcontracts/greenfield-testnet/node_modules/@bnb-chain/greenfield-js-sdk/dist/cjs/index.js');

const client = Client.create('http://127.0.0.1:26750', 9000);
// Mock the sequence fetching
client.txClient.getSimulateTx = async () => ({ authInfoBytes: new Uint8Array(), bodyBytes: new Uint8Array() });
client.txClient.queryClient = { getSequence: async () => ({ sequence: 0, accountNumber: 55 }) };
client.sp = {
  getStorageProviders: async () => [
    {
      operatorAddress: '0x88262259cc540b474d627d7bd62eb996f022879f',
      endpoint: 'http://127.0.0.1:9036',
    }
  ]
};

const msg = {
  bucketName: 'test-bucket',
  creator: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'.toLowerCase(),
  visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
  chargedReadQuota: 0,
  primarySpAddress: '0x88262259cc540b474d627d7bd62eb996f022879f'.toLowerCase(),
  paymentAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'.toLowerCase(),
};

async function run() {
  const originalGetSignByPriKey = client.txClient.getSignByPriKey.bind(client.txClient);
  client.txClient.getSignByPriKey = function(eip712, privateKey) {
     const res = originalGetSignByPriKey(eip712, privateKey);
     console.log("GENERATED SIGNATURE:", res.signature);
     console.log("GENERATED PUBKEY:", res.pubKey);
     
     const ethSigUtil = require('./smartcontracts/greenfield-testnet/node_modules/@metamask/eth-sig-util');
     const recoveredAddress = ethSigUtil.recoverTypedSignature({
        data: eip712,
        signature: res.signature,
        version: ethSigUtil.SignTypedDataVersion.V4
     });
     console.log("RECOVERED ADDRESS:", recoveredAddress);
     return res;
  };

  const tx = await client.bucket.createBucket(msg);
  
  client.txClient.broadcast = async (options) => {
    console.log("EIP-712 Message is generated.");
  };
  
  await tx.broadcast({
    denom: 'BNB',
    gasLimit: 2400,
    gasPrice: '5000000000',
    payer: msg.creator,
    granter: '',
    type: 'ECDSA',
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
  });
}
run().catch(console.error);
