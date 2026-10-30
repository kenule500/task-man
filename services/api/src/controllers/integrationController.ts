import { Request, Response } from 'express';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import { getConfig } from '../config/env.js';
import Workspace, { IWorkspace } from '../models/workspaceModel.js';
import { recordActivity } from '../utils/activity.js';

const newSecret = (): string => crypto.randomBytes(32).toString('hex');

const webhookUrl = (req: Request, slug: string): string => {
  const config = getConfig();
  // In production the API lives behind the public URL; locally it is the host that received this request
  const origin = config.isProduction ? config.clientUrl : `${req.protocol}://${req.get('host')}`;
  return `${origin}/api/integrations/github/${slug}`;
};

/** Settings view of the integration. Only the settings:manage routes below return it (the secret is included). */
const view = async (req: Request) => {
  const workspace = req.workspace as IWorkspace;
  const stored = await Workspace.findById(workspace._id)
    .select('integrations.github.enabled integrations.github.autoTransition integrations.github.connectedAt +integrations.github.secret')
    .lean();
  const github = stored?.integrations?.github;
  const enabled = github?.enabled === true;
  return {
    enabled,
    webhookUrl: webhookUrl(req, workspace.slug),
    ...(enabled && github?.secret ? { secret: github.secret } : {}),
    autoTransition: github?.autoTransition !== false,
    connectedAt: enabled && github?.connectedAt ? github.connectedAt : null,
  };
};

const respond = async (req: Request, res: Response) => {
  // The body can contain the secret: never let a cache keep it
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(await view(req));
};

const audit = (req: Request, summary: string, to?: string) =>
  recordActivity(req, { action: 'integration.updated', summary, changes: to ? [{ field: 'github', to }] : [] });

export const validateGithubSettings = [
  body('autoTransition').isBoolean({ strict: true }).withMessage('autoTransition must be true or false'),
];

// @route GET /api/workspaces/:slug/integrations/github (settings:manage)
export const getGithubIntegration = async (req: Request, res: Response): Promise<void> => {
  try {
    await respond(req, res);
  } catch (error) {
    console.error('getGithubIntegration error:', (error as Error).message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route POST /api/workspaces/:slug/integrations/github/enable (settings:manage); keeps the secret when already enabled
export const enableGithubIntegration = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace as IWorkspace;
    const enabled = await Workspace.updateOne(
      { _id: workspace._id, 'integrations.github.enabled': { $ne: true } },
      { $set: { 'integrations.github.enabled': true, 'integrations.github.secret': newSecret(), 'integrations.github.connectedAt': new Date() } },
    );
    if (enabled.modifiedCount > 0) await audit(req, 'GitHub integration', 'enabled');
    await respond(req, res);
  } catch (error) {
    console.error('enableGithubIntegration error:', (error as Error).message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route POST /api/workspaces/:slug/integrations/github/regenerate-secret (settings:manage)
export const regenerateGithubSecret = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace as IWorkspace;
    const updated = await Workspace.updateOne(
      { _id: workspace._id, 'integrations.github.enabled': true },
      { $set: { 'integrations.github.secret': newSecret() } },
    );
    if (updated.matchedCount === 0) {
      res.status(409).json({ message: 'Enable the GitHub integration first' });
      return;
    }
    await audit(req, 'GitHub integration', 'secret regenerated');
    await respond(req, res);
  } catch (error) {
    console.error('regenerateGithubSecret error:', (error as Error).message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route PATCH /api/workspaces/:slug/integrations/github { autoTransition } (settings:manage)
export const updateGithubIntegration = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const workspace = req.workspace as IWorkspace;
    const autoTransition = req.body.autoTransition === true;
    const before = workspace.integrations?.github?.autoTransition !== false;
    await Workspace.updateOne({ _id: workspace._id }, { $set: { 'integrations.github.autoTransition': autoTransition } });
    if (before !== autoTransition) {
      await recordActivity(req, {
        action: 'integration.updated',
        summary: 'GitHub integration',
        changes: [{ field: 'autoTransition', from: String(before), to: String(autoTransition) }],
      });
    }
    await respond(req, res);
  } catch (error) {
    console.error('updateGithubIntegration error:', (error as Error).message);
    res.status(500).json({ message: 'Server error' });
  }
};

// @route POST /api/workspaces/:slug/integrations/github/disable (settings:manage); forgets the secret
export const disableGithubIntegration = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace as IWorkspace;
    const disabled = await Workspace.updateOne(
      { _id: workspace._id, 'integrations.github.enabled': true },
      { $set: { 'integrations.github.enabled': false }, $unset: { 'integrations.github.secret': '', 'integrations.github.connectedAt': '' } },
    );
    if (disabled.modifiedCount > 0) await audit(req, 'GitHub integration', 'disabled');
    await respond(req, res);
  } catch (error) {
    console.error('disableGithubIntegration error:', (error as Error).message);
    res.status(500).json({ message: 'Server error' });
  }
};
