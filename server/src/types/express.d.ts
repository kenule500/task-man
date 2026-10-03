import { IUser } from '../models/userModel.js';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}