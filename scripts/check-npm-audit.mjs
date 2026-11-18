import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const withdrawnAdvisory = {
  name: "picomatch",
  npmId: 1247710,
  ghsa: "GHSA-fc5q-39xc-vjpf",
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
};
const severities = new Set(["info", "low", "moderate", "high", "critical"]);
const blocking = new Set(["high", "critical"]);

function isWithdrawalCandidate(name, finding) {
  return name === withdrawnAdvisory.name &&
    finding.name === name &&
    finding.dependency === name &&
    finding.source === withdrawnAdvisory.npmId &&
    finding.url === withdrawnAdvisory.url &&
    finding.severity === "high";
}

async function confirmWithdrawal(request) {
  const headers = { Accept: "application/vnd.github+json", "Cache-Control": "no-cache" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  }

  let advisory;
  try {
    const response = await request("https://api.github.com/advisories/" + withdrawnAdvisory.ghsa, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error();
    advisory = await response.json();
  } catch {
    throw new Error("Could not verify the advisory with GitHub.");
  }

  const reportsPackage = Array.isArray(advisory?.vulnerabilities) &&
    advisory.vulnerabilities.some(finding =>
      finding?.package?.ecosystem === "npm" &&
      finding.package.name === withdrawnAdvisory.name);
  const withdrawnAt = advisory?.withdrawn_at;
  const timestamp = typeof withdrawnAt === "string" ? Date.parse(withdrawnAt) : NaN;
  if (advisory?.ghsa_id !== withdrawnAdvisory.ghsa ||
    !reportsPackage || !Number.isFinite(timestamp) || timestamp > Date.now()) {
    throw new Error("GitHub did not confirm withdrawal of " + withdrawnAdvisory.ghsa + ".");
  }
  return withdrawnAt;
}

/** Applies npm's high threshold and verifies the one stale advisory against GitHub. */
export async function checkAuditReport(report, exitCode, request = fetch) {
  if (![0, 1].includes(exitCode) || report?.auditReportVersion !== 2 || report.error ||
    !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
    Array.isArray(report.vulnerabilities)) {
    throw new Error("npm audit did not produce a complete report.");
  }

  const entries = Object.entries(report.vulnerabilities);
  const high = new Map();
  let withdrawalCandidate = false;
  for (const [name, entry] of entries) {
    if (entry?.name !== name || !severities.has(entry.severity) ||
      !Array.isArray(entry.via) || entry.via.length === 0) {
      throw new Error("Invalid npm audit findings.");
    }
    if (entry.severity === "critical") {
      throw new Error("npm audit reported a critical finding for " + name + ".");
    }
    if (entry.severity === "high") high.set(name, entry);

    for (const finding of entry.via) {
      if (typeof finding === "string") {
        if (!Object.hasOwn(report.vulnerabilities, finding)) {
          throw new Error("Missing dependency finding for " + name + ".");
        }
        continue;
      }
      if (!severities.has(finding?.severity)) {
        throw new Error("Invalid npm advisory for " + name + ".");
      }
      if (!blocking.has(finding.severity)) continue;
      if (entry.severity !== "high" || !isWithdrawalCandidate(name, finding)) {
        throw new Error("npm audit reported a high or critical advisory for " + name + ".");
      }
      withdrawalCandidate = true;
    }
  }

  const counts = report.metadata?.vulnerabilities;
  if (counts?.high !== high.size || counts.critical !== 0 || counts.total !== entries.length) {
    throw new Error("npm audit totals do not match the findings.");
  }
  if (exitCode === 0 && high.size === 0) return { counts };
  if (exitCode !== 1 || !withdrawalCandidate) {
    throw new Error("npm audit failed its high-severity threshold.");
  }

  // Follow npm's dependency findings outward from the specific advisory.
  // Set iteration includes the dependents added during traversal.
  const linked = new Set([withdrawnAdvisory.name]);
  for (const dependency of linked) {
    for (const [name, entry] of high) {
      if (entry.via.includes(dependency)) linked.add(name);
    }
  }
  if (linked.size !== high.size) {
    throw new Error("npm audit reported an unrelated high-severity finding.");
  }

  return { counts, withdrawnAt: await confirmWithdrawal(request) };
}

async function main() {
  const npmEnvironment = { ...process.env };
  delete npmEnvironment.GITHUB_TOKEN;
  const audit = spawnSync("npm", ["audit", "--audit-level=high", "--json"], {
    env: npmEnvironment,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000,
  });
  if (audit.error || audit.signal) throw new Error("npm audit could not complete.");

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    throw new Error("npm audit did not return a valid JSON report.");
  }
  const { counts, withdrawnAt } = await checkAuditReport(report, audit.status);
  console.log("npm audit reported " + counts.total + " findings.");
  if (withdrawnAt) {
    console.log("GitHub confirmed withdrawal of " + withdrawnAdvisory.ghsa + " at " +
      withdrawnAt + ". All " + counts.high + " high findings trace to this advisory.");
  }
  console.log("npm audit passed the high-severity threshold.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
