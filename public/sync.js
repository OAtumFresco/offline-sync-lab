export class DeliveryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function retryDelay(attempts, random = Math.random) {
  const base = Math.min(30_000, 1000 * 2 ** Math.min(Math.max(attempts - 1, 0), 5));
  return Math.min(30_000, Math.round(base * (0.8 + random() * 0.4)));
}

export function createSyncEngine({ queue, deliver, canSend = () => true, onChange = () => {} }) {
  let active = null;
  async function run() {
    const result = { sent: 0, replayed: 0, blocked: 0, retryAfter: null };
    const entries = await queue.list();
    for (const entry of entries) {
      if (!canSend()) break;
      if (entry.blocked) continue;
      try {
        const ack = await deliver(entry);
        if (ack?.key !== entry.key || typeof ack?.note?.id !== 'string' || ack.note.text !== entry.text) {
          throw new Error('The server acknowledgement did not match this operation.');
        }
        // Remove only after the matching response is received and validated.
        await queue.remove(entry.key);
        result.sent += 1;
        if (ack.replayed) result.replayed += 1;
      } catch (error) {
        const blocked = [400, 409, 413, 415, 422].includes(error.status);
        const attempts = entry.attempts + 1;
        await queue.put({ ...entry, attempts, blocked, lastError: error.message });
        if (blocked) result.blocked += 1;
        else result.retryAfter = retryDelay(attempts);
      }
      await onChange();
      if (result.retryAfter !== null) break;
    }
    return result;
  }
  return {
    sync() {
      if (!active) active = run().finally(() => { active = null; });
      return active;
    },
  };
}
