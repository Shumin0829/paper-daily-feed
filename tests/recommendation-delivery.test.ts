import { afterEach, describe, expect, it, mock } from "bun:test";
import type { AppConfig } from "../src/app-config.js";
import { deliverRecommendations } from "../src/recommendation-delivery.js";
import type { RecommendedPaper } from "../src/types.js";
import { stubFetch } from "./test-support.js";

afterEach(() => {
  mock.restore();
});

const recommendation: RecommendedPaper = {
  journal: "Nature",
  title: "Resilient streets",
  abstract: "Original abstract retained when summary generation fails.",
  url: "https://example.test/paper",
  publishedAt: new Date("2026-07-01T00:00:00Z"),
  score: 0.9,
  matchContext: null,
  interestCluster: { id: 3, labels: ["resilient urban mobility"] }
};

function summaryRequestKind(requestBody: string): "brief" | "tldr" {
  const payload = JSON.parse(requestBody) as { messages: Array<{ content: string }> };
  const prompt = payload.messages[0]?.content ?? "";
  return prompt.includes("compact editorial brief") ? "brief" : "tldr";
}

const config: Pick<AppConfig, "interests" | "summary" | "dailyRomance" | "delivery" | "runtime"> = {
  interests: {
    profile: {
      enabled: true,
      summary: "Urban mobility and climate resilience.",
      topics: ["transport equity"],
      methods: ["spatial modeling"],
      favoriteJournals: [],
      avoidTopics: [],
      referencePapers: []
    },
    zotero: {
      enabled: false,
      userId: "",
      apiKey: "",
      libraryType: "user",
      includeCollections: [],
      excludeCollections: []
    }
  },
  summary: {
    enabled: true,
    baseUrl: "https://api.example.test/v1",
    model: "summary-model",
    apiKey: "key",
    language: "Chinese",
    maxTokens: 128
  },
  dailyRomance: {
    enabled: true
  },
  delivery: {
    mode: "smtp",
    from: "sender@example.test",
    to: "reader@example.test",
    smtpHost: "smtp.example.test",
    smtpPort: 465,
    smtpPassword: "password"
  },
  runtime: { debug: false, sendEmpty: false }
};

describe("Recommendation Delivery", () => {
  it("keeps the TLDR layout when one AI summary fails", async () => {
    stubFetch(mock(async () => new Response("unavailable", { status: 503 })));

    const result = await deliverRecommendations([recommendation], "preview-email", config, {
      filterUndeliveredPapers: (papers) => papers,
      confirmSuccessfulDelivery: () => undefined
    });

    expect(result.sent).toBe(false);
    expect(result.html).toContain("TLDR 暂时生成失败。");
    expect(result.html).not.toContain(">TLDR:</strong>");
    expect(result.html).not.toContain(">Abstract:</strong>");
  });

  it("keeps successful paper TLDRs when the Today Brief fails", async () => {
    stubFetch(
      mock(async (_url: string, init?: RequestInit) => {
        const requestBody = String(init?.body);
        if (summaryRequestKind(requestBody) === "brief") {
          return new Response("unavailable", { status: 503 });
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "论文从街道尺度分析交通系统的气候韧性。"
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const result = await deliverRecommendations(
      [recommendation],
      "preview-email",
      { ...config, dailyRomance: { enabled: false } },
      {
        filterUndeliveredPapers: (papers) => papers,
        confirmSuccessfulDelivery: () => undefined
      }
    );

    expect(result.html).toContain("论文从街道尺度分析交通系统的气候韧性。");
    expect(result.html).not.toContain(">Abstract:</strong>");
  });

  it("fetches a random quotation when daily romance is enabled", async () => {
    const result = await deliverRecommendations(
      [recommendation],
      "preview-email",
      { ...config, summary: { ...config.summary, enabled: false } },
      {
        filterUndeliveredPapers: (papers) => papers,
        confirmSuccessfulDelivery: () => undefined
      },
      {},
      new Date("2026-07-21T23:00:00.000Z"),
      {
        sendEmail: mock(),
        fetchDailyRomance: mock(async () => ({
          text: "The quieter you become, the more you are able to hear.",
          author: "Rumi",
          sourceTitle: "",
          sourceUrl: "https://zenquotes.io/",
          sourceName: "ZenQuotes"
        }))
      }
    );

    expect(result.html).toContain("The quieter you become, the more you are able to hear.");
    expect(result.html).toContain("Rumi");
    expect(result.html).toContain(">ZenQuotes</a>");
  });

  it("uses the dated main-branch subject without an LLM", async () => {
    const fetchMock = mock(async () => new Response("unexpected"));
    stubFetch(fetchMock);
    const sendEmail = mock(
      async (_delivery: AppConfig["delivery"], _html: string, _subject: string) => ({
        messageId: "fallback-subject"
      })
    );

    await deliverRecommendations(
      [recommendation],
      "run",
      {
        ...config,
        summary: { ...config.summary, enabled: false },
        dailyRomance: { enabled: false }
      },
      {
        filterUndeliveredPapers: (papers) => papers,
        confirmSuccessfulDelivery: () => undefined
      },
      {},
      new Date("2026-08-25T00:00:00Z"),
      { sendEmail }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      config.delivery,
      expect.stringContaining("Original abstract retained when summary generation fails."),
      "Paper feed for 25th August 2026"
    );
    expect(sendEmail.mock.calls[0]?.[1]).not.toContain(">Abstract:</strong>");
  });

  it("keeps the dated main-branch subject when the LLM succeeds", async () => {
    const fetchMock = mock(async (_url: string, init?: RequestInit) => {
        const requestBody = String(init?.body);
        const content = summaryRequestKind(requestBody) === "brief"
          ? "Headline: 韧性街道值得优先关注\nOverview: 街道尺度的空间结构揭示了交通系统的韧性差异。"
          : "论文从街道尺度分析交通系统的气候韧性。";
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });
    stubFetch(fetchMock);
    const sendEmail = mock(async () => ({ messageId: "editorial-subject" }));

    await deliverRecommendations(
      [recommendation],
      "run",
      { ...config, dailyRomance: { enabled: false } },
      {
        filterUndeliveredPapers: (papers) => papers,
        confirmSuccessfulDelivery: () => undefined
      },
      {},
      new Date("2026-08-25T00:00:00Z"),
      { sendEmail }
    );

    expect(sendEmail).toHaveBeenCalledWith(
      config.delivery,
      expect.stringContaining("韧性街道值得优先关注"),
      "Paper feed for 25th August 2026"
    );
    const requestBodies = fetchMock.mock.calls.map((call) => String(call[1]?.body));
    expect(requestBodies.some((body) => body.includes("Recommended paper 1"))).toBeTrue();
    expect(requestBodies.some((body) => body.includes("Reader interests: resilient urban mobility"))).toBeTrue();
    expect(requestBodies.every((body) => !body.includes(config.interests.profile.summary))).toBeTrue();
  });
});
