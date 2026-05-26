/**
 * Daskibo Academy — decentralized claim-signer Lit Action (P3 / audit §4.2).
 *
 * Replaces the centralized `claimSigner` server: this code runs inside the Lit
 * (Chipotle/Lit v3) network, reads the on-chain payment state on BSC, and signs
 * the EIP-712 `Claim` with a **PKP** only when the buyer is actually entitled.
 * The PKP private key never exists off-chain; only this action — pinned by its
 * IPFS CID and assigned to the PKP — can produce a signature. Set the NFT
 * contract's `claimSigner` to the PKP's EVM address to make this the sole minter.
 *
 * Runtime: executed by `POST /core/v1/lit_action` (Chipotle). `Lit`, `ethers`
 * (v5) and `crypto` are injected by the runtime — do NOT add imports.
 *
 * jsParams:
 *   kind            'client' | 'author'
 *   nftAddress      ClientNft / AuthorNft (the verifyingContract for EIP-712)
 *   marketplace     CourseMarketplace address (entitlement source of truth)
 *   courseId        uint
 *   to              recipient address
 *   expiry          uint64 (client only; 0 = perpetual)
 *   nonce, deadline  uint256 (nonce = nft.claimNonces(to))
 *   chainId         EVM chain id of the NFT/marketplace (e.g. 97 BSC testnet)
 *   chain           Lit chain identifier (e.g. 'bscTestnet') for getRpcUrl
 *   pkpPublicKey    PKP public key that signs (its address == claimSigner)
 *   sigName         signature name (default 'claim')
 *
 * Returns (setResponse): { ok, signature?, reason?, digest }.
 */

const go = async () => {
  const sigName = jsParams.sigName || 'claim';
  try {
    // ── 1. Entitlement check on BSC — the buyer must actually have access ──
    const rpcUrl = await Lit.Actions.getRpcUrl({ chain: jsParams.chain });
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const marketplace = new ethers.Contract(
      jsParams.marketplace,
      ['function hasCourseAccess(address,uint256) view returns (bool)'],
      provider,
    );
    const entitled = await marketplace.hasCourseAccess(jsParams.to, jsParams.courseId);
    if (!entitled) {
      Lit.Actions.setResponse({
        response: JSON.stringify({ ok: false, reason: 'NOT_ENTITLED: hasCourseAccess(to,courseId)==false' }),
      });
      return;
    }

    // ── 2. Build the EIP-712 Claim digest (must match claim-eip712.js / the contract) ──
    const isClient = jsParams.kind === 'client';
    const domain = {
      name: isClient ? 'Daskibo Client Pass' : 'Daskibo Author Pass',
      version: '1',
      chainId: Number(jsParams.chainId),
      verifyingContract: jsParams.nftAddress,
    };
    const types = isClient
      ? {
          Claim: [
            { name: 'to', type: 'address' },
            { name: 'expiry', type: 'uint64' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        }
      : {
          Claim: [
            { name: 'to', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        };
    const value = isClient
      ? { to: jsParams.to, expiry: jsParams.expiry, nonce: jsParams.nonce, deadline: jsParams.deadline }
      : { to: jsParams.to, nonce: jsParams.nonce, deadline: jsParams.deadline };

    const digest = ethers.utils._TypedDataEncoder.hash(domain, types, value);

    // ── 3. Sign the digest with the PKP (threshold ECDSA in the TEE/network) ──
    await Lit.Actions.signEcdsa({
      toSign: ethers.utils.arrayify(digest),
      publicKey: jsParams.pkpPublicKey,
      sigName,
    });

    // Lit returns the assembled signature under `sigName` in the action result;
    // the caller submits it to nft.claimWithSig(...).
    Lit.Actions.setResponse({ response: JSON.stringify({ ok: true, digest }) });
  } catch (e) {
    Lit.Actions.setResponse({
      response: JSON.stringify({ ok: false, reason: 'ERROR: ' + (e && e.message ? e.message : String(e)) }),
    });
  }
};

go();
