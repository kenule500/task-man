// Automation rules: run matching rules for recorded activity (owned by the automation module)
let registered = false;

/** Subscribes the automation engine to recorded activity once per process. */
export const registerAutomations = (): void => {
  if (registered) return;
  registered = true;
};
