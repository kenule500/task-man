import dns from 'dns';
import mongoose from 'mongoose';

// Node's bundled DNS resolver (c-ares) can get ECONNREFUSED on the SRV lookup
// that `mongodb+srv://` needs, on networks/routers where it's otherwise fine
// (Windows' own resolver works) — pointing it at public resolvers fixes it.
dns.setServers(['8.8.8.8', '1.1.1.1']);

const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI as string);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    // Exit process with failure code
    process.exit(1);
  }
};

export default connectDB;