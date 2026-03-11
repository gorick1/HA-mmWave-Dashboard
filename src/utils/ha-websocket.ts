import type { HomeAssistant } from '../types/index.js';

/**
 * Subscribe to state change events for specific entity IDs via HA WebSocket.
 * Returns an array of unsubscribe functions.
 */
export async function subscribeEntities(
  hass: HomeAssistant,
  entityIds: string[],
  callback: (entityId: string, newState: { state: string; attributes: Record<string, unknown> } | null) => void
): Promise<Array<() => void>> {
  const unsubscribes = await Promise.all(
    entityIds.map(entityId =>
      hass.connection.subscribeMessage(
        (msg: unknown) => {
          const message = msg as Record<string, unknown>;

          // subscribe_entities returns compressed messages:
          //   Initial snapshot: { a: { entity_id: { s: state, a: attrs, ... } } }
          //   State changes:    { c: { entity_id: { "+": { s: state, ... } } } }

          // Handle initial state snapshot ("a" = added entities)
          const added = message.a as
            | Record<string, { s?: string; a?: Record<string, unknown> }>
            | undefined;
          if (added && added[entityId]) {
            const item = added[entityId];
            callback(entityId, {
              state: item.s ?? 'unknown',
              attributes: item.a ?? {},
            });
          }

          // Handle state changes ("c" = changed entities)
          const changed = message.c as
            | Record<string, Record<string, { s?: string; a?: Record<string, unknown> }>>
            | undefined;
          if (changed && changed[entityId]) {
            const delta = changed[entityId];
            // The delta contains "+" (new keys) or keys whose values changed
            const update = delta['+'] ?? delta;
            if (update && typeof update === 'object' && 's' in update) {
              const u = update as { s?: string; a?: Record<string, unknown> };
              callback(entityId, {
                state: u.s ?? 'unknown',
                attributes: u.a ?? {},
              });
            }
          }

          // Also handle legacy state_changed event format for compatibility
          const legacy = message as {
            type?: string;
            event?: {
              data?: {
                entity_id?: string;
                new_state?: { state: string; attributes: Record<string, unknown> } | null;
              };
            };
          };
          if (legacy.type === 'event') {
            const data = legacy.event?.data;
            if (data && data.entity_id === entityId) {
              callback(entityId, data.new_state ?? null);
            }
          }
        },
        { type: 'subscribe_entities', entity_ids: [entityId] }
      )
    )
  );
  return unsubscribes;
}

/**
 * Get the numeric float value of a HA entity state, or null if unavailable.
 */
export function getNumericState(
  hass: HomeAssistant,
  entityId: string
): number | null {
  const entity = hass.states[entityId];
  if (!entity) return null;
  const val = parseFloat(entity.state);
  return isNaN(val) ? null : val;
}

/**
 * Build the list of entity IDs for a given device name and target IDs.
 */
export function buildEntityIds(
  deviceName: string,
  targetIds: number[]
): { entityId: string; targetId: number; axis: 'x' | 'y' | 'speed' }[] {
  const result: { entityId: string; targetId: number; axis: 'x' | 'y' | 'speed' }[] = [];
  for (const targetId of targetIds) {
    result.push(
      {
        entityId: `sensor.${deviceName}_target_${targetId}_x`,
        targetId,
        axis: 'x',
      },
      {
        entityId: `sensor.${deviceName}_target_${targetId}_y`,
        targetId,
        axis: 'y',
      },
      {
        entityId: `sensor.${deviceName}_target_${targetId}_speed`,
        targetId,
        axis: 'speed',
      }
    );
  }
  return result;
}
