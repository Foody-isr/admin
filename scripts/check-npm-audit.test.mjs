import assert from "node:assert/strict";
import test from "node:test";

import { checkAuditReport } from "./check-npm-audit.mjs";

const ghsa = "GHSA-fc5q-39xc-vjpf";
const picomatch = {
  source: 1247710,
  name: "picomatch",
  dependency: "picomatch",
  severity: "high",
  url: "https://github.com/advisories/" + ghsa,
};
const moderate = { name: "minimatch", severity: "moderate" };

function entry(name, severity, ...via) {
  return { name, severity, via };
}

function report(...findings) {
  return {
    auditReportVersion: 2,
    vulnerabilities: Object.fromEntries(findings.map(finding => [finding.name, finding])),
    metadata: {
      vulnerabilities: {
        high: findings.filter(finding => finding.severity === "high").length,
        critical: findings.filter(finding => finding.severity === "critical").length,
        total: findings.length,
      },
    },
  };
}

function picomatchReport() {
  return report(
    entry("picomatch", "high", picomatch),
    entry("tinyglobby", "high", "picomatch"),
    entry("tooling", "high", "tinyglobby", "minimatch"),
    entry("minimatch", "moderate", moderate),
  );
}

function gitHubAdvisory(withdrawnAt) {
  return {
    ghsa_id: ghsa,
    vulnerabilities: [{ package: { ecosystem: "npm", name: "picomatch" } }],
    withdrawn_at: withdrawnAt,
  };
}

const rejectLookup = () => assert.fail("unexpected GitHub lookup");

test("the ordinary npm threshold works without a GitHub request", async () => {
  const clean = report(entry("minimatch", "moderate", moderate));
  assert.deepEqual(await checkAuditReport(clean, 0, rejectLookup), {
    counts: clean.metadata.vulnerabilities,
  });
});

test("accepts the exact withdrawn advisory and its reported dependency graph", async () => {
  const timestamp = "2024-01-15T11:00:00Z";
  const result = await checkAuditReport(picomatchReport(), 1, async (url, options) => {
    assert.equal(url, "https://api.github.com/advisories/" + ghsa);
    assert.equal(options.redirect, "error");
    return { ok: true, json: async () => gitHubAdvisory(timestamp) };
  });
  assert.equal(result.withdrawnAt, timestamp);
  assert.equal(result.counts.high, 3);
});

test("requires a confirmed withdrawal from the GitHub API", async () => {
  await assert.rejects(checkAuditReport(picomatchReport(), 1, async () => ({
    ok: true, json: async () => gitHubAdvisory(null),
  })), /did not confirm withdrawal/);
  await assert.rejects(checkAuditReport(picomatchReport(), 1, async () => ({
    ok: false,
  })), /Could not verify/);
});

test("rejects additional advisories and unlinked high findings", async () => {
  const reports = [
    [
      report(entry("picomatch", "high", picomatch, { ...picomatch, source: 999 })),
      /high or critical advisory/,
    ],
    [
      report(entry("picomatch", "high", picomatch), entry("unrelated", "critical", "picomatch")),
      /critical finding/,
    ],
    [
      report(entry("picomatch", "high", picomatch), entry("unrelated", "high", moderate)),
      /unrelated high-severity/,
    ],
  ];
  for (const [input, error] of reports) {
    await assert.rejects(checkAuditReport(input, 1, rejectLookup), error);
  }
});

test("fails closed on missing or inconsistent npm evidence", async () => {
  const inconsistent = picomatchReport();
  inconsistent.metadata.vulnerabilities.high -= 1;
  await assert.rejects(checkAuditReport(inconsistent, 1, rejectLookup), /totals do not match/);
  await assert.rejects(checkAuditReport({ error: { code: "EAUDIT" } }, 1, rejectLookup), /complete report/);
  await assert.rejects(checkAuditReport(report(), 1, rejectLookup), /high-severity threshold/);
});
