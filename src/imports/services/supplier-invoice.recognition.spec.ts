import { companyContext as testContext } from '../../../test/fixtures/request-context';
import { SupplierInvoiceService } from './supplier-invoice.service';

describe('Atomic invoice recognition', () => {
  const validRow = { rawName: 'Cable', quantity: 2, supplyPrice: 10 };
  let service: SupplierInvoiceService;
  let db: any;
  let recognition: any;
  let state: any;
  beforeEach(() => {
    state = {
      status: 'REVIEW',
      companyId: 'company-a',
      items: [{ id: 'old', rawName: 'Original' }],
      invoiceNumber: 'old-number',
    };
    db = {
      supplierInvoice: {
        updateMany: jest.fn(async ({ where, data }) => {
          if (
            where.companyId !== state.companyId ||
            !where.status.in.includes(state.status)
          )
            return { count: 0 };
          Object.assign(state, data);
          return { count: 1 };
        }),
        findUnique: jest.fn(async () => structuredClone(state)),
      },
      supplierInvoiceItem: {
        deleteMany: jest.fn(async () => {
          state.items = [];
        }),
        create: jest.fn(async ({ data }) => {
          state.items.push(data);
        }),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    };
    db.$transaction = jest.fn(async (fn) => {
      const before = structuredClone(state);
      try {
        return await fn(db);
      } catch (error) {
        state = before;
        throw error;
      }
    });
    recognition = {
      recognize: jest.fn(async () => ({
        items: [validRow],
        invoiceNumber: 'new-number',
        invoiceDate: '2026-09-08',
      })),
    };
    service = new SupplierInvoiceService(db, {} as any, {} as any, recognition);
    jest.spyOn(service, 'get').mockImplementation(
      async () =>
        ({
          ...structuredClone(state),
          originalFiles: [{ path: 'mock-only' }],
        }) as any,
    );
  });
  it.each(['COMMITTED', 'CANCELLED', 'ROLLED_BACK'])(
    'rejects %s before OCR and deletion',
    async (status) => {
      state.status = status;
      await expect(
        service.recognize(
          'invoice',
          testContext({ companyId: 'company-a', userId: 1 }),
        ),
      ).rejects.toThrow('Invoice can no longer be changed');
      expect(recognition.recognize).not.toHaveBeenCalled();
      expect(db.supplierInvoiceItem.deleteMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    { items: [] },
    { items: [{ ...validRow, quantity: -1 }] },
    { items: [validRow, { ...validRow, rawName: '' }] },
  ])('preserves old rows for invalid OCR result %j', async ({ items }) => {
    recognition.recognize.mockResolvedValue({ items });
    await expect(
      service.recognize(
        'invoice',
        testContext({ companyId: 'company-a', userId: 1 }),
      ),
    ).rejects.toThrow();
    expect(state.items).toEqual([{ id: 'old', rawName: 'Original' }]);
    expect(db.supplierInvoiceItem.deleteMany).not.toHaveBeenCalled();
  });
  it('rechecks status after OCR, before removing data', async () => {
    recognition.recognize.mockImplementation(async () => {
      state.status = 'COMMITTED';
      return { items: [validRow] };
    });
    await expect(
      service.recognize(
        'invoice',
        testContext({ companyId: 'company-a', userId: 1 }),
      ),
    ).rejects.toThrow('Invoice can no longer be changed');
    expect(db.supplierInvoiceItem.deleteMany).not.toHaveBeenCalled();
    expect(state.status).toBe('COMMITTED');
  });
  it('rolls back deletion and metadata if insertion fails', async () => {
    db.supplierInvoiceItem.create.mockRejectedValue(
      new Error('DB insert failed'),
    );
    await expect(
      service.recognize(
        'invoice',
        testContext({ companyId: 'company-a', userId: 1 }),
      ),
    ).rejects.toThrow('DB insert failed');
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(state.items).toEqual([{ id: 'old', rawName: 'Original' }]);
    expect(state.invoiceNumber).toBe('old-number');
  });
  it('replaces all rows, returns new metadata and records one audit entry', async () => {
    const result = await service.recognize(
      'invoice',
      testContext({ companyId: 'company-a', userId: 1 }),
    );
    expect(result.status).toBe('REVIEW');
    expect(result.invoiceNumber).toBe('new-number');
    expect(result.items).toEqual([
      expect.objectContaining({
        rawName: 'Cable',
        quantity: 2,
        totalPrice: 20,
      }),
    ]);
    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
