import express from "express";
import cors from "cors";

// IMPORT ROUTES
import userRoutes from "./routes/userRoutes.js";
import auctionRoutes from "./routes/auctionRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import bidRoutes from "./routes/bidRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

const app = express();

app.use(express.json());
app.use(cors());

/* =========================
   BASIC ROUTES
========================= */

app.get("/", (req, res) => {
  res.json({ message: "API root working 🚀" });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Auction API running 🚀",
  });
});

/* =========================
   USE YOUR ROUTES
========================= */

app.use("/users", userRoutes);
app.use("/auctions", auctionRoutes);
app.use("/auth", authRoutes);
app.use("/bids", bidRoutes);
app.use("/admin", adminRoutes);

/* =========================
   404 HANDLER
========================= */

app.use((req, res) => {
  res.status(404).json({ message: "Route not found ❌" });
});

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err);
  res.status(500).json({
    message: "Internal Server Error",
    error: err.message,
  });
});

export default app;