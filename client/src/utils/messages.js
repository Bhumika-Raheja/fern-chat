export function mergeReactionUpdate(message, update) {
  if (message.deletedAt && !update.deletedAt) return message;
  const currentVersion = message.reactionVersion || 0;
  const nextVersion = update.reactionVersion || 0;
  if (!update.deletedAt && nextVersion < currentVersion) return message;
  if (update.deletedAt) {
    return {
      ...message, body: "", attachments: [], reactions: [],
      deletedAt: message.deletedAt || update.deletedAt,
      reactionVersion: Math.max(currentVersion, nextVersion),
    };
  }
  return { ...message, reactions: update.reactions || [], reactionVersion: nextVersion };
}

const contentTime = (message) => Date.parse(message.editedAt || message.createdAt || "") || 0;

export function mergeSavedMessage(current, incoming) {
  if (!current) return { ...incoming, reactions: incoming.reactions || [], status: "sent" };
  // Reaction writes update updatedAt too; editedAt determines text freshness.
  const useIncoming = !current.deletedAt &&
    (incoming.deletedAt || current.status !== "sent" || contentTime(incoming) >= contentTime(current));
  const result = useIncoming ? { ...current, ...incoming } : { ...incoming, ...current };
  const newestReactions = (incoming.reactionVersion || 0) >= (current.reactionVersion || 0) ? incoming : current;
  result.reactions = newestReactions.reactions || [];
  result.reactionVersion = newestReactions.reactionVersion || 0;
  result.status = "sent";
  if (result.deletedAt) {
    result.body = "";
    result.attachments = [];
    result.reactions = [];
  }
  return result;
}
