import { IUser } from '../models/userModel.js';
import { IWorkspace } from '../models/workspaceModel.js';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      workspace?: IWorkspace;
      workspaceRole?: 'owner' | 'admin' | 'member';
    }
  }
}