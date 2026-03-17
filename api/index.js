import app from "../app.js";
import serverless from "serverless-http";

const handler = serverless(app);

export default async (req, res) => {
  try {
    return await handler(req, res);
  } catch (err) {
    console.error("🔥 FULL ERROR:", err);

    return res.status(500).json({
      message: "Server crashed",
      error: err.message,
      stack: err.stack,
    });
  }
};