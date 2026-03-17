import serverless from "serverless-http";
import app from "../backend/app.js";

// ensure default export is a function (safer for Vercel)
const handler = serverless(app);

export default handler;