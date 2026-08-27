import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src/index.js';

afterEach(() => vi.restoreAllMocks());

describe('CPBL score worker', () => {
  it('validates the date before calling CPBL', async () => {
    const response = await worker.fetch(new Request('https://example.com/?date=2026-8-1'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'date 必須是 YYYY-MM-DD 格式' });
  });

  it('calls the proxy API once and returns its games', async () => {
    const games = [{
      gameNumber: 1,
      time: '2026-08-26T18:35:00',
      awayTeam: '客隊',
      homeTeam: '主隊',
      awayScore: 3,
      homeScore: 2,
      field: '球場',
      status: '已結束'
    }];
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: games })));

    const response = await worker.fetch(new Request('https://example.com/?date=2026-08-26'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-08-26', location: '', kindCode: 'A', count: 1, games
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://project.r567tw.cc/api/cpbl?date=2026-08-26&location=&kindCode=A'
    );
  });
});
