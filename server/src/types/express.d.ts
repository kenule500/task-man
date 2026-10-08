import { IUser } from '../models/userModel.js';
import { IWorkspace } from '../models/workspaceModel.js';
import { IRole } from '../models/roleModel.js';

declare global {
  namespace Express {
    interface Request {
      /** Attached by the `protect` middleware */
      user?: IUser;

      /** Attached by the `requirePermission` middleware */
      workspace?: IWorkspace;

      /** Attached by the `requirePermission` middleware */
      role?: IRole;

      /** Attached by the `requirePermission` middleware */
      permissions?: string[];
    }
  }
}

export {};