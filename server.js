import express from "express";
import { fork } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import uploadCreateHandler from "./api/upload/create.js";
import uploadStatusHandler from "./api/upload/status.js";
import datasetPreviewHandler from "./api/dataset/preview.js";
import datasetSaveMappingHandler from "./api/dataset/save_mapping.js";
import reportCreateHandler from "./api/report/index.js";
import reportStatusHandler from "./api/report/status.js";
import reportViewHandler from "./api/report/view.js";
import reportSendEmailHandler from "./api/report/send_email.js";
import reportDeleteHandler from "./api/report/delete.js";
import libraryHandler from "./api/library/index.js";
import dashboardHandler from "./api/dashboard/index.js";
import bussinessInfoHandler from "./api/bussiness_info/index.js";
import bussinessInfoStatusHandler from "./api/bussiness_info/status.js";
import aiReportHandler from "./api/report/ai_report.js";

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

app.get("/api/upload/status", async (req, res) => {
  try {
    await uploadStatusHandler(req, res);
  } catch (error) {
    console.error("Error in /api/upload/status:", error);
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

app.get("/api/report/status", async (req, res) => {
  try {
    await reportStatusHandler(req, res);
  } catch (error) {
    console.error("Error in /api/report/status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/report", async (req, res) => {
  try {
    await reportCreateHandler(req, res);
  } catch (error) {
    console.error("Error in /api/report", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/report/view", async (req, res) => {
  try {
    await reportViewHandler(req, res);
  } catch (error) {
    console.error("Error in /api/report/view:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/report/send_email", async (req, res) => {
  try {
    await reportSendEmailHandler(req, res);
  } catch (error) {
    console.error("Error in /api/report/send_email:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/report/delete", async (req, res) => {
  try {
    await reportDeleteHandler(req, res);
  } catch (error) {
    console.error("Error in /api/report/delete:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/library", async (req, res) => {
  try {
    await libraryHandler(req, res);
  } catch (error) {
    console.error("Error in /api/library:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    await dashboardHandler(req, res);
  } catch (error) {
    console.error("Error in /api/dashboard:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/bussiness_info", async (req, res) => {
  try {
    await bussinessInfoHandler(req, res);
  } catch (error) {
    console.error("Error in /api/bussiness_info:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/bussiness_info/status", async (req, res) => {
  try {
    await bussinessInfoStatusHandler(req, res);
  } catch (error) {
    console.error("Error in /api/bussiness_info/status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/report/ai_report", async (req, res) => {
  try {
    await aiReportHandler(req, res);
  } catch (error) {
    console.error("Error in /api/report/ai_report:", error);
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
  console.log(`   GET  /api/upload/status?id= - Get upload status`);
  console.log(`   GET  /api/dataset/preview?id= - Preview dataset`);
  console.log(`   POST /api/dataset/save_mapping - Save dataset mapping`);
  console.log(`   GET  /api/report/status?id= - Get report status`);
  console.log(`   POST /api/report - Create report`);
  console.log(`   GET  /api/report/view?id= - View report`);
  console.log(`   POST /api/report/send_email?id= - Send report via email`);
  console.log(`   DELETE /api/report/delete?id= - Delete report`);
  console.log(`   GET  /api/library - Get library`);
  console.log(`   GET  /api/dashboard - Get dashboard metrics`);
  console.log(`   POST /api/bussiness_info - Save business info`);
  console.log(`   GET  /api/bussiness_info/status - Get business info status`);
  console.log(`   GET  /api/report/ai_report?id= - Get AI report`);

  // Start dataset parse worker
  const datasetWorker = fork("./worker/parse_worker.js");
  datasetWorker.on("message", (msg) => {
    console.log(`👷 [Dataset Worker] ${msg}`);
  });
  datasetWorker.on("error", (err) => {
    console.error(`❌ [Dataset Worker] Error: ${err.message}`);
  });
  datasetWorker.on("exit", (code) => {
    console.log(`⚠️ [Dataset Worker] Exited with code ${code}`);
  });

  // Start report generation worker
  const reportWorker = fork("./worker/report_worker.js");
  reportWorker.on("message", (msg) => {
    console.log(`👷 [Report Worker] ${msg}`);
  });
  reportWorker.on("error", (err) => {
    console.error(`❌ [Report Worker] Error: ${err.message}`);
  });
  reportWorker.on("exit", (code) => {
    console.log(`⚠️ [Report Worker] Exited with code ${code}`);
  });
});
