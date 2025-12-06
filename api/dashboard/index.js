import { createClient } from "@supabase/supabase-js";
import dayjs from "dayjs";

export default async function handler(req, res) {
  console.log("📥 - [Dashboard] Request received");

  if (req.method !== "GET") {
    console.error("❌ - [Dashboard] Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.error("❌ - [Dashboard] Missing Authorization header");
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
    token
  );
  if (userErr || !userData?.user) {
    console.error(
      "❌ - [Dashboard] Invalid token or user not found",
      userErr?.message
    );
    return res.status(401).json({ error: "Invalid token" });
  }
  const user = userData.user;

  // Accept explicit user_id but enforce it matches authenticated user
  const userId =
    req.query.user_id || req.query.userId || req.query.id || user.id;
  if (userId !== user.id) {
    console.warn("⚠️ - [Dashboard] User mismatch", {
      userId,
      authUser: user.id,
    });
    return res.status(403).json({ error: "Forbidden: mismatched user" });
  }

  // Use last 30 days window (rolling month) for "último mês"
  const since = dayjs().subtract(1, "month").toISOString();

  const invalidStatuses = ["failed", "invalid"];

  try {
    const [
      totalReports,
      totalReportsLastMonth,
      doneReports,
      doneReportsLastMonth,
      invalidReports,
    ] = await Promise.all([
      supabaseAdmin
        .from("report_requests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId),
      supabaseAdmin
        .from("report_requests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .gte("created_at", since),
      supabaseAdmin
        .from("report_requests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("status", "done"),
      supabaseAdmin
        .from("report_requests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("status", "done")
        .gte("created_at", since),
      supabaseAdmin
        .from("report_requests")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .in("status", invalidStatuses),
    ]);

    const total = totalReports.count || 0;
    const totalLastMonth = totalReportsLastMonth.count || 0;
    const doneTotal = doneReports.count || 0;
    const doneLastMonth = doneReportsLastMonth.count || 0;
    const invalidTotal = invalidReports.count || 0;

    let hoursSaved = 0;
    if (doneTotal === 0) {
      hoursSaved = Math.floor(total * 1.5);
    } else {
      hoursSaved = Math.floor(doneTotal * 1.5);
    }

    const successRate =
      total === 0
        ? 0
        : Number((((total - invalidTotal) / total) * 100).toFixed(2));

    console.log("✅ - [Dashboard] Metrics computed", {
      total,
      totalLastMonth,
      doneTotal,
      doneLastMonth,
      invalidTotal,
      hoursSaved,
      successRate,
    });

    return res.status(200).json({
      user_id: userId,
      total_reports: total,
      total_reports_last_month: totalLastMonth,
      done_reports: doneTotal,
      done_reports_last_month: doneLastMonth,
      hours_saved: hoursSaved,
      success_rate: successRate,
    });
  } catch (err) {
    console.error("❌ - [Dashboard] Error computing metrics:", err.message);
    return res
      .status(500)
      .json({ error: "Failed to compute dashboard metrics" });
  }
}
