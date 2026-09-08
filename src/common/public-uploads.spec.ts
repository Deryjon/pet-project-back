import express = require('express');
import request = require('supertest');
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { publicUploads } from './public-uploads';

describe('Public upload allowlist', () => {
  let root: string;
  let app: express.Express;
  beforeAll(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'crm-public-uploads-test-'));
    for (const folder of ['products', 'avatars', 'invoices']) {
      await fs.mkdir(join(root, folder));
      await fs.writeFile(join(root, folder, 'sample.txt'), folder);
    }
    app = express();
    app.use('/uploads', publicUploads(root));
  });
  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  it.each(['products', 'avatars'])(
    'keeps %s publicly readable',
    async (folder) => {
      await request(app)
        .get(`/uploads/${folder}/sample.txt`)
        .expect(200, folder);
    },
  );
  it.each([
    '/uploads/invoices/sample.txt',
    '/uploads/%69nvoices/sample.txt',
    '/uploads/products/../invoices/sample.txt',
    '/uploads/products/%2e%2e%2finvoices/sample.txt',
  ])('does not serve an invoice at %s', async (url) => {
    const response = await request(app).get(url);
    expect([400, 403, 404]).toContain(response.status);
    expect(response.text).not.toBe('invoices');
  });
});
