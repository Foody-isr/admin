"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bell, CalendarClock, RefreshCw } from "lucide-react";
import { downloadCsv } from "@/lib/csv/export";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHead,
  Textarea,
} from "@/components/ds";
import { apiFetch, getStoredUser } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";

const endpoint = "/api/v1/loyalty/engagement";
const kinds = {
  broadcast: "engBroadcast",
  inactive: "engInactive",
  milestone: "engMilestone",
  expiry: "engExpiry",
  review: "engReview",
} as const;
const segments = {
  all: "engAll",
  new: "engNew",
  regular: "engRegular",
  inactive: "engSleeping",
} as const;
const statLabels = {
  members: "engMembers",
  subscribers: "engSubscribed",
  visits: "engVisits",
  returning: "engReturning",
  rewards: "engRedeemed",
  referrals: "engReferred",
  today: "engToday",
  available_rewards: "engRewardsAvailable",
} as const;
type Kind = keyof typeof kinds;
type Campaign = {
  id: string;
  kind: Kind;
  segment: keyof typeof segments;
  threshold: number;
  message: string;
  review_url?: string;
  stopped_at?: string;
  created_at: string;
};
interface ExportRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  joined_at: string;
  balance: number;
  visits: number;
  last_visit: string | null;
  subscribed: boolean;
}
interface ExportPage {
  members: ExportRow[];
  as_of: string;
  next?: string;
}
type Overview = {
  can_export: boolean;
  available: boolean;
  can_manage: boolean;
  active: boolean;
  campaigns: Campaign[] | null;
  stats: Record<keyof typeof statLabels, number> & {
    return_days: number | null;
    dormant_subscribers: number;
  };
  deliveries?: Record<
    string,
    { sent: number; pending: number; unknown: number; failed: number }
  >;
};
const bounds = {
  inactive: [7, 180, 30],
  milestone: [1, 1000, 10],
  expiry: [1, 30, 3],
} as const;
const selectClass =
  "h-10 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2";

/** Binds reporting, campaigns and actions to one staff session and restaurant. */
export default function LoyaltyEngagement() {
  const { restaurantId } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [actor, setActor] = useState(0);
  useEffect(() => {
    const check = () => setActor(getStoredUser()?.id ?? 0);
    check();
    window.addEventListener("storage", check);
    window.addEventListener("focus", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("focus", check);
    };
  }, [user?.id]);
  if (!actor || actor !== user?.id) return <p role="status">{t("loading")}</p>;
  return (
    <EngagementForm
      key={String(restaurantId) + "-" + actor}
      rid={Number(restaurantId)}
      actor={actor}
    />
  );
}

function EngagementForm({ rid, actor }: { rid: number; actor: number }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<Overview | null>(null);
  const [kind, setKind] = useState<Kind>("broadcast");
  const [segment, setSegment] = useState<Campaign["segment"]>("all");
  const [threshold, setThreshold] = useState("30");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState("");
  const [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const requestID = useRef<{ key: string; id: string } | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const op = new AbortController();
    controller.current = op;
    setError(false);
    try {
      const res = await apiFetch<Overview>(endpoint, rid, {
        signal: op.signal,
        cache: "no-store",
      });
      if (!op.signal.aborted) setData(res);
    } catch {
      if (!op.signal.aborted) {
        setError(true);
        setData(null);
      }
    }
  }, [rid]);
  useEffect(() => {
    void refresh();
    return () => controller.current?.abort();
  }, [refresh]);
  const range =
    kind === "inactive" || kind === "milestone" || kind === "expiry"
      ? bounds[kind]
      : null;
  const campaigns = data?.campaigns ?? [];
  const hasRule =
    kind !== "broadcast" &&
    campaigns.some((c) => c.kind === kind && !c.stopped_at);
  const valid =
    message.trim().length > 0 &&
    Array.from(message.trim()).length <= 180 &&
    (!range ||
      (Number.isInteger(Number(threshold)) &&
        Number(threshold) >= range[0] &&
        Number(threshold) <= range[1])) &&
    (kind !== "review" ||
      /^https:\/\/(g\.page\/r\/[^?#]+\/review|search\.google\.com\/local\/writereview\?placeid=[\w-]+)$/.test(
        review.trim(),
      ));
  async function write(stop?: string) {
    if (busy || getStoredUser()?.id !== actor || !data?.can_manage) return;
    setBusy(true);
    setError(false);
    const op = new AbortController();
    controller.current?.abort();
    controller.current = op;
    try {
      if (stop)
        await apiFetch(endpoint + "/campaigns/" + stop + "/stop", rid, {
          method: "POST",
          signal: op.signal,
        });
      else {
        const value = {
          kind,
          segment: kind === "broadcast" ? segment : "all",
          threshold: range ? Number(threshold) : 0,
          message: message.trim(),
          review_url: kind === "review" ? review.trim() : "",
        };
        const key = JSON.stringify(value);
        if (requestID.current?.key !== key)
          requestID.current = { key, id: crypto.randomUUID() };
        await apiFetch(endpoint + "/campaigns", rid, {
          method: "POST",
          signal: op.signal,
          body: JSON.stringify({ ...value, id: requestID.current.id }),
        });
        if (!op.signal.aborted) {
          requestID.current = null;
          setMessage("");
        }
      }
      if (!op.signal.aborted) await refresh();
    } catch {
      if (!op.signal.aborted) setError(true);
    } finally {
      if (getStoredUser()?.id === actor) setBusy(false);
    }
  }
  async function exportMembers() {
    if (busy || !data?.can_export || getStoredUser()?.id !== actor) return;
    const op = new AbortController();
    controller.current?.abort();
    controller.current = op;
    setBusy(true);
    setError(false);
    try {
      const rows: (string | number)[][] = [
        [
          t("engMemberId"),
          t("engMemberName"),
          t("engMemberPhone"),
          t("engMemberEmail"),
          t("engJoined"),
          t("engBalance"),
          t("engVisitCount"),
          t("engLastVisit"),
          t("engWebPush"),
        ],
      ];
      // Quoting alone does not prevent spreadsheet formula evaluation in a contact field.
      const safeText = (cell: string) =>
        /^[\s]*[=+@-]|^[\t\r\n]/.test(cell) ? "'" + cell : cell;
      let query = "";
      for (;;) {
        const result: ExportPage = await apiFetch(
          endpoint + "/members" + query,
          rid,
          { cache: "no-store", signal: op.signal },
        );
        if (op.signal.aborted || getStoredUser()?.id !== actor) return;
        for (const member of result.members)
          rows.push([
            member.id,
            safeText(member.name),
            safeText(member.phone),
            safeText(member.email),
            member.joined_at,
            member.balance,
            member.visits,
            member.last_visit ?? "",
            t(member.subscribed ? "yes" : "no"),
          ]);
        if (!result.next) break;
        query =
          "?" +
          new URLSearchParams({ after: result.next, as_of: result.as_of });
      }
      downloadCsv("foody-loyalty-" + rid + ".csv", rows);
    } catch {
      if (!op.signal.aborted) setError(true);
    } finally {
      if (!op.signal.aborted) setBusy(false);
    }
  }
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return (
    <div className="max-w-5xl space-y-6 pb-12">
      <Link
        className="inline-flex items-center gap-2 text-sm"
        href={"/" + rid + "/loyalty/program"}
      >
        <ArrowLeft size={16} className="rtl:rotate-180" />
        {t("walletStudioBack")}
      </Link>
      <PageHead
        title={t("engTitle")}
        actions={
          <div className="flex flex-wrap gap-2">
            {data?.can_export && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={exportMembers}
              >
                {t("engExport")}
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={refresh}>
              <RefreshCw size={16} />
              {t("walletStudioReload")}
            </Button>
          </div>
        }
      />
      {error && <p role="alert">{t("engError")}</p>}
      {!data && !error && <p role="status">{t("loading")}</p>}
      {data && (
        <>
          <section
            aria-label={t("engActivity")}
            className="grid grid-cols-2 gap-4 rounded-xl bg-[var(--surface-2)] p-5 md:grid-cols-3"
          >
            {(Object.keys(statLabels) as (keyof typeof statLabels)[]).map(
              (key) => (
                <div key={key}>
                  <div className="text-sm">{t(statLabels[key])}</div>
                  <strong className="text-2xl tabular-nums">
                    {fmt.format(data.stats[key])}
                  </strong>
                </div>
              ),
            )}
            {typeof data.stats.return_days === "number" && (
              <div>
                <div className="text-sm">{t("engReturnDays")}</div>
                <strong className="text-2xl tabular-nums">
                  {fmt.format(data.stats.return_days)}
                </strong>
              </div>
            )}
          </section>
          {data.can_manage &&
            data.active &&
            data.available &&
            data.stats.dormant_subscribers > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  {t("engDormantCount")}{" "}
                  <strong>{fmt.format(data.stats.dormant_subscribers)}</strong>
                </span>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setKind("broadcast");
                    setSegment("inactive");
                    document.getElementById("eng-message")?.focus();
                  }}
                >
                  {t("engDraftReminder")}
                </Button>
              </div>
            )}
          {data.can_manage && data.active && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <Bell size={18} className="me-2 inline" />
                  {t("engCreate")}
                </CardTitle>
              </CardHeader>
              <CardBody>
                {!data.available && <p>{t("engUnavailable")}</p>}
                {data.available && (
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (valid && !hasRule) void write();
                    }}
                  >
                    <fieldset disabled={busy} className="grid min-w-0 gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("engTrigger")}>
                          <select
                            className={selectClass}
                            value={kind}
                            onChange={(e) => {
                              const k = e.target.value as Kind;
                              setKind(k);
                              if (
                                k === "inactive" ||
                                k === "milestone" ||
                                k === "expiry"
                              )
                                setThreshold(String(bounds[k][2]));
                            }}
                          >
                            {Object.entries(kinds).map(([k, v]) => (
                              <option key={k} value={k}>
                                {t(v)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {kind === "broadcast" && (
                          <Field label={t("engAudience")}>
                            <select
                              className={selectClass}
                              value={segment}
                              onChange={(e) =>
                                setSegment(
                                  e.target.value as Campaign["segment"],
                                )
                              }
                            >
                              {Object.entries(segments).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {t(v)}
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        {range && (
                          <Field
                            label={t(
                              kind === "milestone"
                                ? "engVisitCount"
                                : "engDays",
                            )}
                          >
                            <Input
                              type="number"
                              min={range[0]}
                              max={range[1]}
                              value={threshold}
                              onChange={(e) => setThreshold(e.target.value)}
                            />
                          </Field>
                        )}
                      </div>
                      {kind === "review" && (
                        <Field label={t("engReviewLink")}>
                          <Input
                            type="url"
                            required
                            dir="ltr"
                            value={review}
                            onChange={(e) => setReview(e.target.value)}
                          />
                        </Field>
                      )}
                      <Field label={t("engMessage")}>
                        <Textarea
                          id="eng-message"
                          maxLength={180}
                          required
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                        />
                      </Field>
                      <p className="text-sm text-[var(--fg-muted)]">
                        {t("engConsentHelp")}
                      </p>
                      {hasRule && <p role="status">{t("engExisting")}</p>}
                      <Button
                        type="submit"
                        disabled={!valid || hasRule}
                        className="justify-self-start"
                      >
                        {t(kind === "broadcast" ? "engQueue" : "engActivate")}
                      </Button>
                    </fieldset>
                  </form>
                )}
              </CardBody>
            </Card>
          )}
          {campaigns.length > 0 && (
            <section>
              <h2 className="pb-3 text-lg font-semibold">{t("engHistory")}</h2>
              <ul className="divide-y divide-[var(--line)]">
                {campaigns.map((c) => {
                  const delivery = data.deliveries?.[c.id];
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-4"
                    >
                      <div>
                        <h3 className="flex items-center gap-2 font-semibold">
                          <CalendarClock size={16} />
                          {t(kinds[c.kind])}
                        </h3>
                        <p dir="auto">{c.message}</p>
                        <p className="text-sm text-[var(--fg-muted)]">
                          {new Date(c.created_at).toLocaleDateString(locale)} ·{" "}
                          {c.kind === "broadcast"
                            ? t(segments[c.segment])
                            : c.threshold
                              ? fmt.format(c.threshold) +
                                " " +
                                t(
                                  c.kind === "milestone"
                                    ? "engVisitCount"
                                    : "engDays",
                                )
                              : t("engReview")}
                        </p>
                        {delivery && (
                          <p className="text-sm">
                            {t("engSent")} {delivery.sent} · {t("engPending")}{" "}
                            {delivery.pending} · {t("engFailed")}{" "}
                            {delivery.failed} · {t("engUnknown")}{" "}
                            {delivery.unknown}
                          </p>
                        )}
                      </div>
                      {c.stopped_at ? (
                        <Badge>{t("engStopped")}</Badge>
                      ) : (
                        data.can_manage && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void write(c.id)}
                          >
                            {t("engStop")}
                          </Button>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
