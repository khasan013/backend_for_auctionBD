import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.json({ message: "API WORKING 🚀" });
});

// ✅ ADDED (for frontend)
app.get("/auctions", (req, res) => {
  res.json([
    { id: 1, title: "Test Auction", price: 100 },
    { id: 2, title: "Laptop", price: 800 },
    { id: 3, title: "Phone", price: 500 }
  ]);
});
app.get("/debug", (req, res) => {
  res.send("DEBUG WORKING");
});

export default app;