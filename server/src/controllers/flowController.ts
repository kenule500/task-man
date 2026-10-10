import { Request, Response } from 'express';

/**
 * @desc    Flow analytics (cumulative flow, cycle and lead time, aging work in progress)
 * @route   GET /api/workspaces/:slug/reports/flow
 * @access  Private (projects:read)
 */
export const getFlowReport = async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json({ message: 'Not implemented yet' });
};
