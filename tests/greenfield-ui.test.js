/**
 * Daskibo Academy — Greenfield bucket-console UI glue tests (TDD)
 *
 * greenfield-ui.js wires the DOM of smartcontracts/index.html to the pure
 * greenfield-core client. It must stay testable under jsdom with a mock
 * client (no network, no wallet).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initBucketConsole } from '../smartcontracts/buckets/greenfield-ui.js';

function setupDom() {
  document.body.innerHTML = `
    <input id="gf-owner" />
    <form id="gf-create-form"><input id="gf-bucket-name" /><button>create</button></form>
    <form id="gf-search-form"><input id="gf-search-query" /><button>search</button></form>
    <form id="gf-save-form">
      <input id="gf-save-bucket" /><input id="gf-save-key" />
      <textarea id="gf-save-body"></textarea><button>save</button>
    </form>
    <form id="gf-read-form">
      <input id="gf-read-bucket" /><input id="gf-read-key" /><button>read</button>
    </form>
    <ul id="gf-bucket-list"></ul>
    <pre id="gf-object-output"></pre>
    <div id="gf-status"></div>
  `;
}

function mockClient(overrides = {}) {
  return {
    createBucket: vi.fn(async () => ({ bucketName: 'b', txHash: '0x1' })),
    listBuckets: vi.fn(async () => []),
    searchBuckets: vi.fn(async () => [{ name: 'course-01', visibility: 'public' }]),
    saveObject: vi.fn(async () => ({ bucketName: 'b', objectKey: 'k', txHash: '0x2' })),
    readObject: vi.fn(async () => '# content'),
    ...overrides,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('initBucketConsole', () => {
  let client;
  beforeEach(() => {
    setupDom();
    client = mockClient();
    initBucketConsole({ doc: document, client });
  });

  it('creates a bucket on form submit and reports status', async () => {
    document.getElementById('gf-bucket-name').value = 'my-bucket';
    document.getElementById('gf-create-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await flush();
    expect(client.createBucket).toHaveBeenCalledWith('my-bucket', expect.any(Object));
    expect(document.getElementById('gf-status').textContent).toMatch(/created|0x1/i);
  });

  it('renders search results into the bucket list', async () => {
    document.getElementById('gf-search-query').value = 'course';
    document.getElementById('gf-search-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await flush();
    expect(client.searchBuckets).toHaveBeenCalledWith('course');
    expect(document.getElementById('gf-bucket-list').textContent).toContain('course-01');
  });

  it('saves an object from the save form', async () => {
    document.getElementById('gf-save-bucket').value = 'my-bucket';
    document.getElementById('gf-save-key').value = 'a.md';
    document.getElementById('gf-save-body').value = '# Hi';
    document.getElementById('gf-save-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await flush();
    expect(client.saveObject).toHaveBeenCalledWith(
      'my-bucket',
      'a.md',
      '# Hi',
      expect.any(Object),
    );
  });

  it('reads an object and shows it in the output pane', async () => {
    document.getElementById('gf-read-bucket').value = 'my-bucket';
    document.getElementById('gf-read-key').value = 'a.md';
    document.getElementById('gf-read-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await flush();
    expect(client.readObject).toHaveBeenCalledWith('my-bucket', 'a.md');
    expect(document.getElementById('gf-object-output').textContent).toBe('# content');
  });

  it('surfaces a coded error to the status area', async () => {
    client.createBucket.mockRejectedValueOnce(
      Object.assign(new Error('bad'), { code: 'INVALID_BUCKET_NAME' }),
    );
    document.getElementById('gf-bucket-name').value = 'X';
    document.getElementById('gf-create-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await flush();
    expect(document.getElementById('gf-status').textContent).toMatch(
      /INVALID_BUCKET_NAME/,
    );
  });
});
