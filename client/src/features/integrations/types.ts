/** Settings view of the GitHub integration (GET /workspaces/:slug/integrations/github). */
export interface GitHubIntegration {
  enabled: boolean;
  /** Payload URL to paste into the GitHub webhook. */
  webhookUrl: string;
  /** Shared secret; only present while enabled (and only for members who may manage settings). */
  secret?: string;
  /** Move tasks to in progress when a pull request opens and to completed when it merges. */
  autoTransition: boolean;
  connectedAt: string | null;
}
