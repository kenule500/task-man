import express, { Router } from 'express';
import {
  createPage,
  deletePage,
  getPage,
  getVersion,
  listPages,
  listVersions,
  movePage,
  restoreVersion,
  searchPages,
  updatePage,
  validateCreatePage,
  validateListPages,
  validateMovePage,
  validateSearchPages,
  validateUpdatePage,
} from '../controllers/pageController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';

// Mounted at /api/workspaces/:slug/pages (routes protect themselves)
const router: Router = express.Router({ mergeParams: true });

router.use(protect);

router.get('/', requirePermission('tasks:read'), validateListPages, listPages);
// Before "/:id" so "search" is not read as a page id
router.get('/search', requirePermission('tasks:read'), validateSearchPages, searchPages);
router.post('/', requirePermission('tasks:write'), validateCreatePage, createPage);
router.get('/:id', requirePermission('tasks:read'), getPage);
router.patch('/:id', requirePermission('tasks:write'), validateUpdatePage, updatePage);
router.delete('/:id', requirePermission('tasks:delete'), deletePage);
router.post('/:id/move', requirePermission('tasks:write'), validateMovePage, movePage);
router.get('/:id/versions', requirePermission('tasks:read'), listVersions);
router.get('/:id/versions/:version', requirePermission('tasks:read'), getVersion);
router.post('/:id/restore/:version', requirePermission('tasks:write'), restoreVersion);

export default router;
