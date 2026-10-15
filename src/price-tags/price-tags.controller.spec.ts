import { Logger } from '@nestjs/common';
import { companyContext } from '../../test/fixtures/request-context';
import { PriceTagsController } from './price-tags.controller';

describe('PriceTagsController print metrics', () => {
  const controller = new PriceTagsController({} as never, {} as never);
  const warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);

  afterEach(() => warn.mockClear());

  it('logs a slow print stage with the company and device', () => {
    controller.logPrintMetrics(
      {
        stage: 'render',
        duration_ms: 4210.6,
        labels: 20,
        chunk: 2,
        user_agent: 'Android 8',
      },
      companyContext(),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({
      company_id: 'company-1',
      stage: 'render',
      duration_ms: 4211,
      labels: 20,
      chunk: 2,
      user_agent: 'Android 8',
    });
  });

  it('ignores unknown stages and broken durations', () => {
    controller.logPrintMetrics(
      { stage: 'other', duration_ms: 5000 },
      companyContext(),
    );
    controller.logPrintMetrics(
      { stage: 'data', duration_ms: 'x' },
      companyContext(),
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
