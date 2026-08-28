import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src/index.js';

afterEach(() => vi.restoreAllMocks());

describe('MLB score worker', () => {
  it('validates the date before calling MLB Stats API', async () => {
    const response = await worker.fetch(new Request('https://example.com/?date=2026-8-1'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'date 必須是 YYYY-MM-DD 格式' });
  });

  it('maps MLB games into the score response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      dates: [{ games: [{
        gamePk: 123,
        gameDate: '2026-08-26T10:35:00Z',
        teams: {
          away: { team: { name: 'Away' }, score: 3 },
          home: { team: { name: 'Home' }, score: 2 },
        },
        venue: { name: 'Stadium' },
        status: { abstractGameState: 'Final', detailedState: 'Final' },
      }] }],
    })));

    const response = await worker.fetch(new Request('https://example.com/?date=2026-08-26'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      date: '2026-08-26',
      count: 1,
      games: [{
        gameNumber: '123', time: '2026-08-26 18:35:00 Taipei', awayTeam: 'Away', homeTeam: 'Home',
        awayScore: '3', homeScore: '2', venue: 'Stadium', inning: 'Final', status: 'Final',
      }],
    });
  });
});