import { MoodleClient } from './moodle.client';

describe('MoodleClient', () => {
  let client: MoodleClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new MoodleClient('http://moodle.test', 'test-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('call() error handling', () => {
    it('should append hint for webservice_access_exception', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            exception: 'webservice_access_exception',
            message: 'Access control exception',
          }),
      });

      await expect(client.call('some_function')).rejects.toThrow(
        'Ensure the wsfunction is added to your Moodle external service',
      );
    });

    it('should not append hint for other exceptions', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () =>
          Promise.resolve({
            exception: 'dml_write_exception',
            message: 'Some DB error',
          }),
      });

      await expect(client.call('some_function')).rejects.toThrow(
        /^Moodle API error \(dml_write_exception\): Some DB error$/,
      );
    });
  });
});
