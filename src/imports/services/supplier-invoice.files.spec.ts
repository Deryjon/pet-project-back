import { promises as fs } from 'fs';
import { resolve } from 'path';
import { companyContext as testContext } from '../../../test/fixtures/request-context';
import { SupplierInvoiceService } from './supplier-invoice.service';

describe('Private invoice downloads', () => {
  afterEach(() => jest.restoreAllMocks());
  function setup(filePath: string, accessible = true) {
    const db = {
      supplierInvoice: {
        findFirst: jest.fn().mockResolvedValue(
          accessible
            ? {
                originalFiles: [
                  {
                    path: filePath,
                    name: 'invoice.pdf',
                    mimeType: 'application/pdf',
                  },
                ],
              }
            : null,
        ),
      },
    };
    const service = new SupplierInvoiceService(
      db as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { db, service };
  }
  it('rejects a foreign invoice before reading its file', async () => {
    const read = jest.spyOn(fs, 'readFile');
    const { db, service } = setup(resolve('private/invoices/test.pdf'), false);
    await expect(
      service.readFile('foreign', 0, testContext({ companyId: 'own' })),
    ).rejects.toThrow('Invoice not found');
    expect(db.supplierInvoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'foreign', companyId: 'own' } }),
    );
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['private/invoices/test.pdf', 'uploads/invoices/legacy.pdf'])(
    'allows authorized access to %s',
    async (file) => {
      const read = jest
        .spyOn(fs, 'readFile')
        .mockResolvedValue(Buffer.from('pdf'));
      const { service } = setup(resolve(file));
      await expect(
        service.readFile('own', 0, testContext({ companyId: 'own' })),
      ).resolves.toMatchObject({
        data: Buffer.from('pdf'),
        name: 'invoice.pdf',
      });
      expect(read).toHaveBeenCalledWith(resolve(file));
    },
  );
  it('rejects paths outside invoice storage', async () => {
    const read = jest.spyOn(fs, 'readFile');
    const { service } = setup(resolve('private/invoices/../../.env'));
    await expect(
      service.readFile('own', 0, testContext({ companyId: 'own' })),
    ).rejects.toThrow('Invoice file not found');
    expect(read).not.toHaveBeenCalled();
  });
});
