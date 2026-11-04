import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { IWorkspace, MAX_WIP_LIMIT, WIP_STATUSES, WipLimits } from '../models/workspaceModel.js';
import { recordActivity } from '../utils/activity.js';

/** The limits stored on the workspace, with `null` for columns that have none (also for old workspaces). */
export const wipLimitsOf = (workspace: IWorkspace): WipLimits => {
  const stored = workspace.boardSettings?.wipLimits;
  return Object.fromEntries(WIP_STATUSES.map(status => [status, stored?.[status] ?? null])) as WipLimits;
};

const isLimit = (value: unknown) =>
  value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_WIP_LIMIT);

export const validateBoardSettings = [
  body('wipLimits').isObject().withMessage('wipLimits is required')
    .bail()
    .custom((limits: Record<string, unknown>) => Object.keys(limits).every(key => (WIP_STATUSES as readonly string[]).includes(key)))
    .withMessage('Unknown board column')
    .bail()
    .custom((limits: Record<string, unknown>) => Object.values(limits).every(isLimit))
    .withMessage(`Each limit must be null or a whole number from 1 to ${MAX_WIP_LIMIT}`),
];

// ================================================================
// @desc    WIP limits of the board columns
// @route   GET /api/workspaces/:slug/board-settings
// @desc    Requires tasks:read (enforced by route middleware)
// ================================================================
export const getBoardSettings = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ wipLimits: wipLimitsOf(req.workspace as IWorkspace) });
};

// ================================================================
// @desc    Change the WIP limits; columns left out of the body keep their limit, null removes it
// @route   PUT /api/workspaces/:slug/board-settings
// @desc    Requires settings:manage (enforced by route middleware)
// ================================================================
export const updateBoardSettings = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const workspace = req.workspace as IWorkspace;
    const before = wipLimitsOf(workspace);
    const requested = req.body.wipLimits as Partial<WipLimits>;
    const after = { ...before, ...requested };

    workspace.set('boardSettings', { wipLimits: after });
    await workspace.save();

    const changes = WIP_STATUSES
      .filter(status => before[status] !== after[status])
      .map(status => ({
        field: `wip:${status}`,
        from: before[status] === null ? undefined : String(before[status]),
        to: after[status] === null ? undefined : String(after[status]),
      }));
    if (changes.length > 0) {
      await recordActivity(req, { action: 'workspace.updated', summary: workspace.name, changes });
    }
    res.status(200).json({ wipLimits: wipLimitsOf(workspace) });
  } catch (error) {
    console.error('updateBoardSettings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
