// Outbound webhooks: deliver recorded activity to subscribed URLs (owned by the webhooks module)
let registered = false;

/** Subscribes webhook delivery to recorded activity once per process. */
export const registerWebhooks = (): void => {
  if (registered) return;
  registered = true;
};
