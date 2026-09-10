import { successfulProcessingFixture } from './fixtures/acknowledged-transport';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { NextRequest } from 'next/server';
const sent: string[][] = [];
const writes: {
  weapon: string;
  category: string;
  entries: Record<string, unknown>;
}[] = [];
let failWeapon = '';
mock.module('../src/lib/rcon/service', () => ({
  executeAcknowledgedBatch: async (commands: string[]) => {
    sent.push(commands); return successfulProcessingFixture(commands);
  }
}));
mock.module('../src/lib/database/apply', () => ({
  buildRconCommands: async () => ['string ezconfig ArmingSword Strike {"Windup":"0.50"}']
}));
mock.module('../src/lib/database/applyRecord', () => ({
  writeApplyRecord: async () => {},
  readApplyRecord: async () => null
}));
mock.module('../src/lib/database/service', () => ({
  readCategory: async () => ({
    CanCombo: true
  }),
  writeCategory: async (weapon: string, category: string, entries: Record<string, unknown>) => {
    if (weapon === failWeapon) throw new Error('Disk failure');
    writes.push({
      weapon,
      category,
      entries
    });
  }
}));
const {
  POST: apply
} = await import('../src/app/api/apply/route');
const {
  POST: bulk
} = await import('../src/app/api/config/bulk-weapons/route');
const request = (body: unknown) => new Request('http://localhost/api', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(body)
});
beforeEach(() => {
  sent.length = 0;
  writes.length = 0;
  failWeapon = '';
});
describe('apply endpoint', () => {
  test('an empty selection with wipe sends only the wipe command', async () => {
    const response = await apply(request({
      commands: [],
      wipeDatabase: true
    }));
    expect(response.status).toBe(200);
    expect(sent).toEqual([['string ezconfig WipeDatabases']]);
  });
  test('an empty selection without wipe never falls back to all overrides', async () => {
    await apply(request({
      commands: [],
      wipeDatabase: false
    }));
    expect(sent).toEqual([[]]);
  });
  test('omitting commands retains legacy full apply behavior', async () => {
    await apply(request({
      wipeDatabase: false
    }));
    expect(sent[0]).toEqual(['string ezconfig ArmingSword Strike {"Windup":"0.50"}']);
  });
  test('rejects a malformed selection before RCON', async () => {
    expect((await apply(request({
      commands: 'all'
    }))).status).toBe(400);
    expect(sent).toHaveLength(0);
  });
});
describe('bulk weapon endpoint', () => {
  test('saves different values while preserving other keys and unselected weapons', async () => {
    const response = await bulk(request({
      category: 'Strike',
      weaponValues: {
        ArmingSword: {
          Windup: 0.4
        },
        Greatsword: {
          Windup: 0.6
        }
      }
    }) as NextRequest);
    expect(response.status).toBe(200);
    expect(writes).toEqual([{
      weapon: 'ArmingSword',
      category: 'Strike',
      entries: {
        CanCombo: true,
        Windup: 0.4
      }
    }, {
      weapon: 'Greatsword',
      category: 'Strike',
      entries: {
        CanCombo: true,
        Windup: 0.6
      }
    }]);
  });
  test('validates the whole batch before any write', async () => {
    const response = await bulk(request({
      category: 'Strike',
      weaponValues: {
        ArmingSword: {
          Windup: 0.4
        },
        Greatsword: {
          Windup: 'bad'
        }
      }
    }) as NextRequest);
    expect(response.status).toBe(400);
    expect(writes).toHaveLength(0);
  });
  test('rejects unknown weapons and path traversal', async () => {
    expect((await bulk(request({
      category: 'Strike',
      weaponValues: {
        '../other': {
          Windup: 0.4
        }
      }
    }) as NextRequest)).status).toBe(400);
    expect(writes).toHaveLength(0);
  });
  test('reports exactly which weapons succeeded on partial failure', async () => {
    failWeapon = 'Greatsword';
    const response = await bulk(request({
      category: 'Strike',
      weaponValues: {
        ArmingSword: {
          Windup: 0.4
        },
        Greatsword: {
          Windup: 0.6
        }
      }
    }) as NextRequest);
    expect(response.status).toBe(500);
    expect((await response.json()).data).toEqual({
      weaponsUpdated: 1,
      updatedWeapons: ['ArmingSword'],
      failedWeapons: ['Greatsword']
    });
  });
});
