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
          const message = msg as {
            type?: string;
            event?: {
              data?: {
                entity_id?: string;
                new_state?: { state: string; attributes: Record<string, unknown> } | null;
              };
            };
            [key: string]: unknown;
          };
          // Handle subscribe_entities response format
          if (message.type === 'event') {
            const data = message.event?.data;
            if (data && data.entity_id === entityId) {
              callback(entityId, data.new_state ?? null);
            }
          } else if (message.type === 'result') {
            // Initial state batch — look for entity in the result
            const items = message as unknown as {
              a?: Record<string, { s?: string; a?: Record<string, unknown> }>;
            };
            if (items.a && items.a[entityId]) {
              const item = items.a[entityId];
              callback(entityId, {
                state: item.s ?? 'unknown',
                attributes: item.a ?? {},
              });
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
