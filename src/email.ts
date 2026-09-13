import nodemailer from "nodemailer";
import { fileURLToPath } from "node:url";
import type { DeliveryConfig } from "./app-config.js";
import type { DailyRomance } from "./daily-romance.js";
import {
  EMAIL_ICON_CID,
  EMAIL_WIDTH,
  renderSharedEmailFooter,
  renderSharedEmailHeader,
  SHARED_EMAIL_STYLES
} from "./email-layout.js";
import type { EditorialDigest, PaperBrief, TodayBrief } from "./summary.js";
import { hasMeaningfulAbstract } from "./text.js";
import type { RecommendedPaper } from "./types.js";

const ABSTRACT_EXCERPT_LIMIT = 320;
const EMAIL_SENDER_NAME = "Daily Paper Feeds";
const FALLBACK_PREHEADER = "Research selected for you, ready when you are.";

type RenderablePaper = Omit<RecommendedPaper, "matchContext"> & {
  matchContext?: RecommendedPaper["matchContext"];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function languageAttribute(value: string): string {
  return /[\u3400-\u9fff]/u.test(value) ? ' lang="zh-CN"' : "";
}

function formatDate(value: Date | null): string {
  return value?.toISOString().slice(0, 10) ?? "";
}

function formatEditionDate(value: Date): string {
  return value
    .toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    })
    .replace(",", "")
    .toUpperCase();
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function ensureSentenceEnding(value: string): string {
  const normalized = value.trim();
  if (!normalized || /[.!?。！？…]["'”’）)]?$/.test(normalized)) return normalized;
  return `${normalized}${/[\u3400-\u9fff]/.test(normalized) ? "。" : "."}`;
}

function fallbackPreheader(papers: RenderablePaper[]): string {
  const firstPaper = papers[0];
  if (!firstPaper) return FALLBACK_PREHEADER;
  return truncateText(firstPaper.abstract || firstPaper.title, 150) || FALLBACK_PREHEADER;
}

function renderRomance(romance: DailyRomance | null | undefined): string {
  if (!romance) return "";

  const romanceByline = [
    romance.author,
    romance.sourceTitle === romance.author ? "" : romance.sourceTitle
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="left" class="romance-copy-cell" style="padding: 0; text-align: left;">
                        <p${languageAttribute(romance.text)} class="text-tertiary" style="margin: 0; color: #6e6e73; font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.55;">&ldquo;${escapeHtml(
                          romance.text
                        )}&rdquo;</p>
                        <p class="text-tertiary" style="margin: 7px 0 0 0; color: #86868b; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Arial, sans-serif; font-size: 14px; line-height: 1.45; letter-spacing: 0.02em; text-align: left;">&mdash;&nbsp;${romanceByline ? `${romanceByline} · ` : ""}<a href="${escapeHtml(
                          romance.sourceUrl
                        )}" class="muted-link" style="color: #aeaeb2; text-decoration: underline;">${escapeHtml(romance.sourceName)}</a></p>
                      </td>
                    </tr>
                  </table>`;
}

function renderBrand(editionDate: Date): string {
  return renderSharedEmailHeader(formatEditionDate(editionDate));
}

function renderEditorial(brief: TodayBrief): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px;">
                    <tr>
                      <td class="editorial-copy" style="padding: 0; text-align: left;">
                        <h1${languageAttribute(brief.headline)} class="text-primary" style="margin: 0; color: #1d1d1f; font-size: 30px; line-height: 1.14; font-weight: 700; letter-spacing: -0.025em;">${escapeHtml(
                          brief.headline
                        )}</h1>
                        <p${languageAttribute(brief.overview)} class="editorial-overview text-secondary" style="margin: 14px 0 0 0; color: #424245; font-size: 17px; line-height: 1.5;">${escapeHtml(
                          brief.overview
                        )}</p>
                      </td>
                    </tr>
                  </table>`;
}

function renderMetaLine(paper: RenderablePaper): string {
  const date = formatDate(paper.publishedAt);
  const values = [paper.journal, date].filter(Boolean);
  return `<p class="journal-meta accent" style="margin: 14px 0 0 0; color: #007aff; font-size: 14px; font-weight: 400; line-height: 1.5; overflow-wrap: anywhere; word-break: break-word;">${escapeHtml(
    values.join(" · ")
  )}</p>`;
}

function renderAuthors(paper: RenderablePaper): string {
  if (!paper.authors?.length) return "";
  return `<p class="text-secondary" style="margin: 0 0 6px 0; color: #424245; font-size: 14px; line-height: 1.45;">${escapeHtml(
    paper.authors.join(", ")
  )}</p>`;
}

function renderAffiliation(paper: RenderablePaper): string {
  if (!paper.firstAffiliation?.trim()) return "";
  return `<p class="text-tertiary" style="margin: 0; color: #6e6e73; font-size: 14px; line-height: 1.45;">${escapeHtml(
    paper.firstAffiliation.trim()
  )}</p>`;
}

function renderRecommendationScore(paper: RenderablePaper): string {
  return `<p class="text-tertiary" style="margin: 10px 0 0 0; color: #6e6e73; font-size: 14px; line-height: 1.4;">Match score&nbsp;&middot;&nbsp;${(
    paper.score * 100
  ).toFixed(1)}%</p>`;
}

function renderBrief(brief: PaperBrief | undefined, paper: RenderablePaper): string {
  if (brief) {
    return `<p${languageAttribute(brief.tldr)} class="paper-copy text-primary" style="margin: 12px 0 0 0; color: #1d1d1f; font-size: 17px; line-height: 1.6;">${escapeHtml(
      ensureSentenceEnding(brief.tldr)
    )}</p>`;
  }

  const fallback = hasMeaningfulAbstract(paper.abstract)
    ? truncateText(paper.abstract, ABSTRACT_EXCERPT_LIMIT)
    : "No abstract provided.";
  return `<p${languageAttribute(fallback)} class="paper-copy text-secondary" style="margin: 12px 0 0 0; color: #424245; font-size: 17px; line-height: 1.6;">${escapeHtml(
    ensureSentenceEnding(fallback)
  )}</p>`;
}

function renderPaper(paper: RenderablePaper, brief?: PaperBrief): string {
  return `<tr>
            <td style="padding: 0 0 36px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="paper-card" style="width: 100%; table-layout: fixed; background: #ffffff; border-collapse: separate;">
                <tr>
                  <td class="paper-pad" style="padding: 0 28px; overflow-wrap: anywhere; word-break: break-word;">
                    <a class="paper-inner" href="${escapeHtml(paper.url)}" style="display: block; padding: 8px 0; color: inherit; text-decoration: none;">
                    <h2 class="paper-title" style="margin: 0; font-size: 22px; line-height: 1.3; font-weight: 700; letter-spacing: 0; overflow-wrap: anywhere; word-break: break-word;">
                      <span class="text-primary" style="color: #1d1d1f;">${escapeHtml(
                        paper.title
                      )}</span>
                    </h2>
                    ${renderBrief(brief, paper)}
                    <div class="paper-details" style="margin-top: 18px;">
                      ${renderAuthors(paper)}
                      ${renderAffiliation(paper)}
                      ${renderRecommendationScore(paper)}
                    </div>
                    ${renderMetaLine(paper)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function renderEmail(
  papers: RenderablePaper[],
  romance: DailyRomance | null = null,
  digest: EditorialDigest | null = null,
  now = new Date()
): string {
  const sortedPapers = [...papers].sort((left, right) => right.score - left.score);
  const briefByUrl = new Map(
    papers.map((paper, index) => [paper.url, digest?.papers[index]] as const)
  );
  const preheader = digest?.todayBrief?.overview || fallbackPreheader(sortedPapers);
  const content =
    sortedPapers.length === 0
      ? `<tr><td class="paper-card text-secondary" style="background: #ffffff; padding: 24px; color: #424245; font-size: 17px; line-height: 1.5;">No recommended papers today.</td></tr>`
      : sortedPapers.map((paper) => renderPaper(paper, briefByUrl.get(paper.url))).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>Daily Paper Feeds</title>
    <style>
      ${SHARED_EMAIL_STYLES}
      .paper-card, [data-ogsc] .paper-card { background: transparent !important; }
      .paper-inner:focus-visible { outline: 2px solid #007aff; outline-offset: 6px; }
      .paper-details p { line-height: 1.5 !important; }
      @media only screen and (max-width: 680px) {
        .page-pad { padding: 24px 10px !important; }
        .email-shell { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; }
        .header-pad { padding: 24px 20px !important; }
        .closing-pad { padding-left: 20px !important; padding-right: 20px !important; }
        .editorial-copy { padding-left: 0 !important; padding-right: 0 !important; }
        .paper-pad { padding-left: 20px !important; padding-right: 20px !important; }
      }
      @media only screen and (min-width: 600px) {
        .paper-title { font-size: 24px !important; }
        .editorial-overview { font-size: 18px !important; }
      }
    </style>
  </head>
  <body class="email-body" style="margin: 0; padding: 0;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent; mso-hide: all;">${escapeHtml(
      preheader
    )}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td align="center" class="page-pad" style="padding: 34px 16px; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1d1d1f;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" class="email-shell" style="width: 100%; max-width: ${EMAIL_WIDTH}px; table-layout: fixed; border-collapse: collapse;">
            <tr>
              <td class="header-pad" style="padding: 28px 28px 24px 28px;">
                ${renderBrand(now)}
                ${digest?.todayBrief ? renderEditorial(digest.todayBrief) : ""}
              </td>
            </tr>
            ${content}
            <tr>
              <td align="left" style="padding: 0 28px 28px; text-align: left; color: #86868b; font-size: 14px; line-height: 1.5;" class="closing-pad text-tertiary">
                ${romance ? renderRomance(romance) : ""}
                <div style="height: ${romance ? "28px" : "0"}; font-size: 0; line-height: 0;">&nbsp;</div>
                ${renderSharedEmailFooter()}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function requiredValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Missing required delivery value: ${label}.`);
  return normalized;
}

function requiredPort(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`Expected delivery value ${label} to be a number.`);
  return value;
}

function emailAddress(value: string): string {
  return value.match(/<([^>]+)>/)?.[1]?.trim() ?? value;
}

function formatSender(value: string): string {
  return `"${EMAIL_SENDER_NAME}" <${emailAddress(value)}>`;
}

const SMTP_RETRY_DELAYS_MS = [2_000, 5_000] as const;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isSmtpConnectionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "command" in error && error.command === "CONN";
}

export async function sendEmail(
  delivery: DeliveryConfig,
  html: string,
  subject: string,
  createTransport: typeof nodemailer.createTransport = nodemailer.createTransport,
  wait: (milliseconds: number) => Promise<void> = sleep
): Promise<unknown> {
  const sender = requiredValue(delivery.from, "from");
  const receiver = requiredValue(delivery.to, "to");
  const smtpServer = requiredValue(delivery.smtpHost, "smtpHost");
  const smtpPort = requiredPort(delivery.smtpPort, "smtpPort");
  const senderPassword = requiredValue(delivery.smtpPassword, "smtpPassword");

  for (let attempt = 0; ; attempt += 1) {
    const transporter = createTransport({
      host: smtpServer,
      port: smtpPort,
      secure: smtpPort === 465,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      auth: { user: emailAddress(sender), pass: senderPassword }
    });

    try {
      return await transporter.sendMail({
        from: formatSender(sender),
        to: receiver,
        subject,
        html,
        attachments: [
          {
            filename: "paper-daily-feed-icon.png",
            path: fileURLToPath(new URL("../docs/paper-daily-feed-icon.png", import.meta.url)),
            cid: EMAIL_ICON_CID,
            contentDisposition: "inline"
          }
        ]
      });
    } catch (error) {
      const retryDelay = SMTP_RETRY_DELAYS_MS[attempt];
      if (!isSmtpConnectionError(error) || retryDelay === undefined) throw error;
      console.warn(
        `SMTP connection attempt ${attempt + 1}/${SMTP_RETRY_DELAYS_MS.length + 1} failed; retrying in ${retryDelay}ms.`
      );
      await wait(retryDelay);
    }
  }
}
