import express from "express";
import { fork } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import uploadCreateHandler from "./api/upload/create.js";
import datasetPreviewHandler from "./api/dataset/preview.js";
import datasetSaveMappingHandler from "./api/dataset/save_mapping.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "RelatorIA Backend API is running",
    version: "1.0.0",
  });
});

// Upload create endpoint
app.post("/api/upload/create", async (req, res) => {
  try {
    await uploadCreateHandler(req, res);
  } catch (error) {
    console.error("Error in /api/upload/create:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/dataset/preview", async (req, res) => {
  try {
    await datasetPreviewHandler(req, res);
  } catch (error) {
    console.error("Error in /api/dataset/preview:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/dataset/save_mapping", async (req, res) => {
  try {
    await datasetSaveMappingHandler(req, res);
  } catch (error) {
    console.error("Error in /api/dataset/save_mapping:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`\n📍 Available endpoints:`);
  console.log(`   GET  / - Health check`);
  console.log(`   POST /api/upload/create - Create upload URL`);
  console.log(`   GET  /api/dataset/preview?id= - Preview dataset`);
  console.log(`   POST /api/dataset/save_mapping - Save dataset mapping`);

  // Start the worker process
  const worker = fork("./worker/parse_worker.js");
  worker.on("message", (msg) => {
    console.log(`👷 [Worker] ${msg}`);
  });
  worker.on("error", (err) => {
    console.error(`❌ [Worker] Error: ${err.message}`);
  });
  worker.on("exit", (code) => {
    console.log(`⚠️ [Worker] Exited with code ${code}`);
  });
});
