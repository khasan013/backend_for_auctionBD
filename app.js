import express from "express";

const app = express();

app.use(express.json());

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Auction API running 🚀",
  });
});

// Example route (you can add your real routes here)
app.get("/api/test", (req, res) => {
  res.json({ success: true });
});

export default app;