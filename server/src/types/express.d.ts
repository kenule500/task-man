import { IUser } from '../models/userModel.js';
import { IWorkspace } from '../models/workspaceModel.js';
import { IRole } from '../models/roleModel.js';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      /** Attached by `requirePermission` middleware */
      workspace?: IWorkspace;
      /** Attached by `requirePermission` middleware */
      role?: IRole;
      /** Attached by `requirePermission` middleware */
      permissions?: string[];
    }
  }
}

export {};