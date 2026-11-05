const queues = new Map();

// Keep local database changes and their room notifications in the same order.
export async function withConversationLock(id, task) {
  const previous = queues.get(id) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  queues.set(id, tail);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (queues.get(id) === tail) queues.delete(id);
  }
}
