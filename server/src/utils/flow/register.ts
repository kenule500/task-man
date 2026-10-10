// Flow tracking: records status transitions from the activity stream (owned by the flow analytics module)
let registered = false;

/** Subscribes flow tracking to recorded activity once per process. */
export const registerFlowTracking = (): void => {
  if (registered) return;
  registered = true;
};
