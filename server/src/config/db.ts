import mongoose from 'mongoose';
import { getConfig } from './env.js';

const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(getConfig().mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    // Exit process with failure code
    process.exit(1);
  }
};

export default connectDB;