import dns from 'dns';
import mongoose from 'mongoose';
import { getConfig } from './env.js';

// Node's bundled DNS resolver (c-ares) can get ECONNREFUSED on the SRV lookup
// that `mongodb+srv://` needs on some home routers. Opt in with
// MONGO_DNS_SERVERS=8.8.8.8,1.1.1.1 instead of overriding DNS for every deploy.
const dnsServers = (process.env.MONGO_DNS_SERVERS ?? '').split(',').map(s => s.trim()).filter(Boolean);
if (dnsServers.length > 0) dns.setServers(dnsServers);

/** Connects once; reuses the open connection on later calls (serverless warm starts). */
const connectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) return;
  const conn = await mongoose.connect(getConfig().mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log(`MongoDB Connected: ${conn.connection.host}`);
};

export default connectDB;