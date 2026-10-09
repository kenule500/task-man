// Vercel serverless entry for the TaskMan API. All /api/* requests are routed
// here (see vercel.json); the web app is served as static files from client/dist.
export { default } from '../server/src/app.js';
