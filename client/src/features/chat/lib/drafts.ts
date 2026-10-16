// Unsent text per channel, kept while the page is open so switching channels does not lose a half-written message.
const drafts = new Map<string, string>();

export const getDraft = (channelId: string): string => drafts.get(channelId) ?? '';

export const setDraft = (channelId: string, text: string): void => {
  if (text) drafts.set(channelId, text);
  else drafts.delete(channelId);
};

export const clearDrafts = (): void => drafts.clear();
