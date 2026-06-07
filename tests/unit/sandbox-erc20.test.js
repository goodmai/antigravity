/**
 * [unit] ERC-20 approve / transferFrom / allowance
 *
 * Extends sandbox-evm.test.js with EIP-20 completeness:
 * approve, transferFrom, infinite allowance, Approval events.
 * No DOM, no network.
 */

import { describe, it, expect } from 'vitest';
import {
  createSandbox,
  SandboxError,
  MAX_UINT256,
  ZERO_ADDRESS,
  APPROVE_GAS,
  TRANSFER_FROM_GAS,
  GAS_PRICE,
} from '../../academy/courses/web3-genesis/assets/sandbox.js';

const TOKEN = { name: 'AGT', symbol: 'AGT', decimals: 0, initialSupply: 1000n };

function deploy() {
  const sb = createSandbox();
  const { address } = sb.deployERC20('alice', TOKEN);
  return { sb, token: address };
}

describe('allowance', () => {
  it('defaults to 0 for unset owner→spender pairs', () => {
    const { sb, token } = deploy();
    expect(sb.allowance(token, 'alice', 'bob')).toBe(0n);
    expect(sb.allowance(token, 'bob', 'alice')).toBe(0n);
  });
});

describe('approve', () => {
  it('records the allowance and emits Approval', () => {
    const { sb, token } = deploy();
    const tx = sb.approve(token, 'alice', 'bob', 50n);
    expect(sb.allowance(token, 'alice', 'bob')).toBe(50n);
    expect(tx.logs).toHaveLength(1);
    expect(tx.logs[0].event).toBe('Approval');
    expect(tx.logs[0].args.value).toBe(50n);
  });

  it('overwrites the previous allowance (EIP-20 race-condition surface)', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', 50n);
    sb.approve(token, 'alice', 'bob', 200n);
    expect(sb.allowance(token, 'alice', 'bob')).toBe(200n);
  });

  it('reverts on approve to address(0)', () => {
    const { sb, token } = deploy();
    expect(() => sb.approve(token, 'alice', ZERO_ADDRESS, 1n))
      .toThrowError(SandboxError);
  });

  it('reverts on negative amount', () => {
    const { sb, token } = deploy();
    expect(() => sb.approve(token, 'alice', 'bob', -1n)).toThrowError(SandboxError);
  });

  it('charges APPROVE_GAS to the owner', () => {
    const { sb, token } = deploy();
    const before = sb.getBalance('alice');
    sb.approve(token, 'alice', 'bob', 50n);
    const after = sb.getBalance('alice');
    expect(before - after).toBe(APPROVE_GAS * GAS_PRICE);
  });
});

describe('transferFrom', () => {
  it('moves tokens and decrements allowance', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', 100n);
    const tx = sb.transferFrom(token, 'bob', 'alice', 'carol', 40n);

    expect(sb.balanceOf(token, 'alice')).toBe(960n);
    expect(sb.balanceOf(token, 'carol')).toBe(40n);
    expect(sb.allowance(token, 'alice', 'bob')).toBe(60n);

    expect(tx.logs).toHaveLength(1);
    expect(tx.logs[0].event).toBe('Transfer');
    expect(tx.logs[0].args.from).toBe(sb.resolve('alice'));
    expect(tx.logs[0].args.to).toBe(sb.resolve('carol'));
  });

  it('does NOT emit Approval on auto-decrement (OZ 4+ semantics)', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', 100n);
    const tx = sb.transferFrom(token, 'bob', 'alice', 'carol', 40n);
    expect(tx.logs.filter((l) => l.event === 'Approval')).toHaveLength(0);
  });

  it('leaves allowance untouched when set to MAX_UINT256 (infinite)', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', MAX_UINT256);
    sb.transferFrom(token, 'bob', 'alice', 'carol', 500n);
    expect(sb.allowance(token, 'alice', 'bob')).toBe(MAX_UINT256);
    expect(sb.balanceOf(token, 'carol')).toBe(500n);
  });

  it('reverts when allowance is insufficient', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', 10n);
    expect(() => sb.transferFrom(token, 'bob', 'alice', 'carol', 50n))
      .toThrowError(/insufficient allowance/i);
  });

  it('reverts when caller is not approved at all', () => {
    const { sb, token } = deploy();
    expect(() => sb.transferFrom(token, 'bob', 'alice', 'carol', 1n))
      .toThrowError(/insufficient allowance/i);
  });

  it('reverts on transferFrom to address(0)', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', 100n);
    expect(() => sb.transferFrom(token, 'bob', 'alice', ZERO_ADDRESS, 1n))
      .toThrowError(/zero address/i);
  });

  it('reverts when balance is insufficient even if allowance is enough', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'carol', 'bob', 1_000_000n);
    expect(() => sb.transferFrom(token, 'bob', 'carol', 'dave', 1n))
      .toThrowError(/exceeds balance/i);
  });

  it('charges TRANSFER_FROM_GAS to the spender (not the owner)', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', 100n);
    const aliceBefore = sb.getBalance('alice');
    const bobBefore = sb.getBalance('bob');
    sb.transferFrom(token, 'bob', 'alice', 'carol', 1n);
    expect(sb.getBalance('alice')).toBe(aliceBefore);
    expect(bobBefore - sb.getBalance('bob')).toBe(TRANSFER_FROM_GAS * GAS_PRICE);
  });
});

describe('EIP-20 invariants: approve + transferFrom mixed flows', () => {
  it('sum(balanceOf) == totalSupply through a long chain of transfers', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', MAX_UINT256);
    sb.transferFrom(token, 'bob', 'alice', 'carol', 200n);
    sb.transferFrom(token, 'bob', 'alice', 'dave',  100n);
    sb.transfer(token, 'carol', 'dave', 50n);
    sb.approve(token, 'dave', 'alice', 30n);
    sb.transferFrom(token, 'alice', 'dave', 'bob', 30n);

    const sum =
      sb.balanceOf(token, 'alice') +
      sb.balanceOf(token, 'bob') +
      sb.balanceOf(token, 'carol') +
      sb.balanceOf(token, 'dave');
    expect(sum).toBe(sb.totalSupply(token));
  });

  it('Approval events are queryable via getEvents filter', () => {
    const { sb, token } = deploy();
    sb.approve(token, 'alice', 'bob', 50n);
    sb.approve(token, 'carol', 'dave', 99n);
    const approvals = sb.getEvents({ event: 'Approval' });
    expect(approvals).toHaveLength(2);
    expect(approvals[0].args.value).toBe(50n);
    expect(approvals[1].args.value).toBe(99n);
  });
});
