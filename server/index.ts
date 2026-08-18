import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import apiRoutes from "./routes/api.js";
import transformRoutes from "./routes/transform.js";
import educationRoutes from "./routes/education.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "OK", message: "Server is running" });
});

app.get("/api/config", (req: Request, res: Response) => {
  res.json({
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use("/api", apiRoutes);

// Learn Your Way Transform Routes
app.use("/api/v1", transformRoutes);

// Education API Routes (BKT, FSRS, Quiz - proxied to Python)
app.use("/api/v1", educationRoutes);

// Serve output directory for generated files
app.use("/output", express.static(path.join(process.cwd(), "output")));
app.use("/outputs", express.static(path.join(process.cwd(), "outputs")));

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));

  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, "../dist/index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
