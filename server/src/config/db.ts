import dns from 'dns';
import mongoose from 'mongoose';
import { getConfig } from './env.js';

// Node's bundled DNS resolver (c-ares) can get ECONNREFUSED on the SRV lookup
// that `mongodb+srv://` needs on some home routers. Opt in with
// MONGO_DNS_SERVERS=8.8.8.8,1.1.1.1 instead of overriding DNS for every deploy.
const dnsServers = (process.env.MONGO_DNS_SERVERS ?? '').split(',').map(s => s.trim()).filter(Boolean);
if (dnsServers.length > 0) dns.setServers(dnsServers);

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