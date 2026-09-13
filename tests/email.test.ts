import { beforeEach, describe, expect, it, mock } from "bun:test";
import packageMetadata from "../package.json";
import { renderEmail, sendEmail } from "../src/email.js";
import type { DeliveryConfig } from "../src/app-config.js";
import type { RecommendedPaper } from "../src/types.js";

describe("renderEmail", () => {
  it("renders a compact paper card with the recommendation score", () => {
    const papers: RecommendedPaper[] = [
      {
        journal: "Nature Cities",
        title: "Transit accessibility improves climate resilience",
        abstract:
          "Public transit accessibility and climate resilience in neighborhoods. This abstract continues with enough detail to prove the renderer uses a compact excerpt rather than dumping the full source text into the bulletin.",
        url: "https://example.test/transit",
        publishedAt: new Date("2026-04-28T10:30:00.000Z"),
        authors: ["Ada Lovelace", "Grace Hopper"],
        firstAffiliation: "Example University",
        score: 0.456,
        matchContext: {
          bestMatchSource: "zotero",
          bestMatchTitle: "Urban mobility and climate adaptation",
          bestMatchTopics: ["transit", "climate resilience"]
        }
      }
    ];

    const html = renderEmail(papers);

    expect(html).toContain("Transit accessibility improves climate resilience");
    expect(html).toContain("Nature Cities");
    expect(html).toContain("2026-04-28");
    expect(html).toContain("Nature Cities · 2026-04-28");
    expect(html).toContain('class="journal-meta accent" style="margin: 14px 0 0 0; color: #007aff;');
    const item = html.match(/<a class="paper-inner"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    expect(item).toContain("Transit accessibility improves climate resilience");
    expect(item).not.toContain("<a ");
    expect(item.indexOf("paper-copy")).toBeLessThan(item.indexOf("Ada Lovelace"));
    expect(item.indexOf("Match score")).toBeLessThan(item.indexOf("Nature Cities"));
    expect(item.trim()).toEndWith("Nature Cities · 2026-04-28</p>");
    expect(html).toContain('.paper-card, [data-ogsc] .paper-card { background: transparent !important; }');
    expect(html).not.toContain("01 · Nature Cities");
    expect(html).toContain("Ada Lovelace, Grace Hopper");
    expect(html).toContain("Example University");
    expect(html).toContain("45.6%");
    expect(html).toContain("Match score&nbsp;&middot;&nbsp;");
    expect(html).toContain("Match score&nbsp;&middot;&nbsp;45.6%</p>");
    expect(html).not.toContain(">45.6%</strong>");
    expect(html.indexOf("Match score&nbsp;&middot;&nbsp;")).toBeGreaterThan(
      html.indexOf("Public transit accessibility and climate resilience in neighborhoods.")
    );
    expect(html).not.toContain('bgcolor="#007aff"');
    expect(html).not.toContain("border-radius: 999px");
    expect(html).not.toContain("Matched your interests");
    expect(html).not.toContain("Urban mobility and climate adaptation");
    expect(html).toContain('class="paper-card"');
    expect(html).toContain('style="padding: 0 0 36px 0;"');
    expect(html).toContain('class="paper-pad" style="padding: 0 28px;');
    expect(html).not.toContain("border: 1px solid #d9ebff");
    expect(html).not.toContain("border-radius: 18px");
    expect(html).not.toContain("lead-paper");
    expect(html).not.toContain("Abstract:");
    expect(html).toContain("Public transit accessibility and climate resilience in neighborhoods.");
    expect(html).toContain("https://example.test/transit");
    expect(html).not.toContain("&nearr;</span></a>");
    expect(html).not.toContain("Read paper");
    expect(html).toContain(packageMetadata.homepage);
    expect(html).toContain(">Manage settings</a>");
    expect(html).toContain(`${packageMetadata.homepage}#customization`);
    expect(html).not.toContain("Unsubscribe");
    expect(html).toContain(".header-meta { display: none !important; }");
    expect(html).toContain(".action-link { text-decoration: underline !important; }");
    expect(html).not.toContain("color: #0051d5");
    expect(html).toContain('lang="en"');
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1.0"');
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain("max-width: 600px; table-layout: fixed;");
    expect(html).toContain('align="center"');
    expect(html).not.toContain("background: #e8f4ff");
    expect(html).not.toContain('bgcolor="#e8f4ff"');
    expect(html).toContain("background: #ffffff");
    expect(html).toContain("color: #007aff");
    expect(html).toContain("background: #000000 !important");
    expect(html).toContain("background: #1c1c1e !important");
    expect(html).toContain("color: #0a84ff !important");
    expect(html).toContain('src="cid:paper-daily-feed-icon"');
    expect(html).toContain(
      'style="padding-left: 10px; color: #007aff; font-size: 18px; font-weight: 700;'
    );
    expect(html).toContain('class="header-rule border-color"');
    expect(html).toContain("border-bottom: 1px solid #d2d2d7");
    expect(html).not.toContain("paper-daily-feed-icon-light");
    expect(html).not.toContain("raw.githubusercontent.com");
    expect(html).not.toContain("<article");
    expect(html).not.toContain("<main");
  });

  it("renders a no-paper message for an empty digest", () => {
    expect(renderEmail([])).toContain("No recommended papers today");
  });

  it("renders the sourced daily quotation as an epilogue after the papers", () => {
    const paper: RecommendedPaper = {
      journal: "Nature",
      title: "A paper before the daily quotation",
      abstract: "Example abstract.",
      url: "https://example.test/after-quote",
      publishedAt: null,
      score: 0.9,
      matchContext: null
    };
    const html = renderEmail(
      [paper],
      {
        text: "空山新雨后，天气晚来秋。",
        author: "王维",
        sourceTitle: "山居秋暝",
        sourceUrl: "https://hitokoto.cn?uuid=example",
        sourceName: "一言"
      },
      null,
      new Date("2026-08-25T00:00:00Z")
    );

    expect(html).toContain("空山新雨后，天气晚来秋。");
    expect(html).toContain('<p lang="zh-CN" class="text-tertiary"');
    expect(html).toContain("王维");
    expect(html).toContain(">一言</a>");
    expect(html).toContain('class="muted-link" style="color: #aeaeb2; text-decoration: underline;">一言</a>');
    expect(html).toContain("山居秋暝");
    expect(html).toContain("https://hitokoto.cn?uuid=example");
    expect(html.indexOf("空山新雨后")).toBeGreaterThan(
      html.indexOf("A paper before the daily quotation")
    );
    expect(html.indexOf("空山新雨后")).toBeLessThan(html.indexOf("Built with"));
    expect(html).toContain("AUG 25 2026");
    expect(html).not.toContain("AUG 25, 2026");
    expect(html).toContain(
      'align="right" style="padding-bottom: 14px; color: #6e6e73; font-size: 14px; font-weight: 400; letter-spacing: 0.06em; white-space: nowrap;" class="header-meta text-tertiary"'
    );
    expect(html.indexOf("AUG 25 2026")).toBeLessThan(html.indexOf("空山新雨后"));
    expect(html).toContain('class="romance-copy-cell"');
    expect(html).toContain('align="left" class="romance-copy-cell"');
    expect(html).toContain("padding: 0; text-align: left;");
    expect(html).toContain("&rdquo;</p>");
    expect(html).toContain("letter-spacing: 0.02em; text-align: left;");
    expect(html).toContain('class="footer-credit text-tertiary"');
    expect(html).toContain('width="40" cellpadding="0" cellspacing="0" border="0" style="width: 40px; margin: 0 0 15px 0;"');
    expect(html).toContain('border-top: 1px solid #e5e5e7;');
    expect(html).toContain('class="accent" style="color: #007aff; font-weight: 700; text-decoration: none;">paper-daily-feed</a>');
    expect(html).toContain('class="accent" style="color: #007aff; font-weight: 700; text-decoration: none;">nehSgnaiL</a>');
    expect(html).toContain('class="footer-action text-tertiary"');
    expect(html).toContain('class="muted-link" style="color: #aeaeb2; text-decoration: underline;">Manage settings</a>');
    expect(html.indexOf("Built with")).toBeLessThan(html.indexOf("Manage settings"));
    expect(html).not.toContain("@media only screen and (max-width: 480px)");
    expect(html).not.toContain('colspan="3"');
    expect(html).not.toContain('width: 2px; background: #007aff;');
    expect(html).not.toContain("padding-top: 13px; border-top: 1px solid #d2d2d7;");
    expect(html).not.toContain("background: #bddcf5");
    expect(html).toContain(
      "font-family: Georgia, 'Times New Roman', serif; font-size: 16px; line-height: 1.55;"
    );
    expect(html).not.toContain("Research Bulletin");
    expect(html).not.toContain(
      "A recommendation of papers based on your research interests."
    );
    expect(html).not.toContain("Anonymous");
  });

  it("keeps English daily quotations visually subordinate to paper titles", () => {
    const html = renderEmail([], {
      text: "The quieter you become, the more you are able to hear.",
      author: "Rumi",
      sourceTitle: "",
      sourceUrl: "https://zenquotes.io/",
      sourceName: "ZenQuotes"
    });

    expect(html).toContain("serif; font-size: 16px; line-height: 1.55;");
    expect(html).not.toContain("font-style: italic;");
  });

  it("renders the editorial hierarchy only when an LLM digest is available", () => {
    const paper: RecommendedPaper = {
      journal: "Nature Cities",
      title: "Networks shape accessible cities",
      abstract: "The study models accessibility over an urban transport network.",
      url: "https://example.test/networks",
      publishedAt: null,
      score: 0.9,
      matchContext: null
    };
    const digest = {
      todayBrief: {
        headline: "空间网络正在重塑可达性研究",
        overview: "网络结构正从背景变量转变为可达性模型的核心输入。"
      },
      papers: [
        {
          tldr: "论文联合建模连续空间与交通网络以预测城市出行。实验覆盖多个城市，以比较模型的迁移能力"
        }
      ]
    };

    const editorialHtml = renderEmail(
      [paper],
      {
        text: "A quiet thought between the brief and the papers.",
        author: "Example Author",
        sourceTitle: "",
        sourceUrl: "https://example.test/quote",
        sourceName: "Example Quotes"
      },
      digest,
      new Date("2026-08-25T00:00:00Z")
    );
    const fallbackHtml = renderEmail([paper], null, null, new Date("2026-08-25T00:00:00Z"));

    expect(editorialHtml).not.toContain("Today&rsquo;s brief");
    expect(editorialHtml).toContain("空间网络正在重塑可达性研究</h1>");
    expect(editorialHtml).toContain('<h1 lang="zh-CN" class="text-primary"');
    expect(editorialHtml).toContain('<p lang="zh-CN" class="editorial-overview text-secondary"');
    expect(editorialHtml).toContain('<p lang="zh-CN" class="paper-copy text-primary"');
    expect(editorialHtml).not.toContain("空间网络正在重塑可达性研究。</h1>");
    expect(editorialHtml).not.toContain('class="brief-label text-tertiary"');
    expect(editorialHtml).toContain('class="editorial-copy"');
    expect(editorialHtml).toContain("padding: 0; text-align: left;");
    expect(editorialHtml).not.toContain("letter-spacing: -0.025em; text-align: center;");
    expect(editorialHtml).not.toContain("Start here");
    expect(editorialHtml).not.toContain("TLDR:");
    expect(editorialHtml).not.toContain("Why read this");
    expect(editorialHtml).toContain(
      "论文联合建模连续空间与交通网络以预测城市出行。实验覆盖多个城市，以比较模型的迁移能力。"
    );
    expect(editorialHtml).toContain(
      'class="paper-copy text-primary" style="margin: 12px 0 0 0; color: #1d1d1f; font-size: 17px; line-height: 1.6;">论文联合建模连续空间与交通网络以预测城市出行。'
    );
    expect(editorialHtml).not.toContain("它对应城市出行研究");
    expect(editorialHtml).not.toContain("Why it fits&nbsp;&mdash;");
    expect(editorialHtml).not.toContain('class="text-tertiary" style="color: #6e6e73;"');
    expect(editorialHtml).not.toContain("Takeaway");
    expect(editorialHtml).not.toContain("Why this fits");
    expect(editorialHtml).toContain("AUG 25 2026");
    expect(editorialHtml.indexOf("Networks shape accessible cities")).toBeLessThan(
      editorialHtml.indexOf("A quiet thought between the brief and the papers.")
    );
    expect(fallbackHtml).not.toContain("Today&rsquo;s brief");
    expect(fallbackHtml).not.toContain('class="brief-label text-tertiary"');
    expect(fallbackHtml).not.toContain(">TLDR:</strong>");
    expect(fallbackHtml).not.toContain("Abstract:");
    expect(fallbackHtml).toContain("AUG 25 2026");
  });

  it("renders only the title translation for a title-only paper brief", () => {
    const paper: RecommendedPaper = {
      journal: "IJGIS",
      title: "Georeferencing complex relative locality descriptions with large language models",
      abstract: "",
      url: "https://example.test/georeferencing",
      publishedAt: null,
      score: 0.8,
      matchContext: null
    };
    const html = renderEmail([paper], null, {
      todayBrief: {
        headline: "地理文本处理正在采用大型语言模型",
        overview: "研究关注相对位置描述的地理编码。"
      },
      papers: [
        {
          tldr: "基于大型语言模型对复杂相对位置描述进行地理编码。",
          titleOnly: true
        }
      ]
    });

    expect(html).toContain("基于大型语言模型对复杂相对位置描述进行地理编码。");
  });

  it("renders recommended papers from highest score to lowest score", () => {
    const html = renderEmail([
      {
        journal: "Science",
        title: "Low score paper",
        abstract: "",
        url: "https://example.test/low",
        publishedAt: null,
        score: 0.4
      },
      {
        journal: "Nature",
        title: "High score paper",
        abstract: "",
        url: "https://example.test/high",
        publishedAt: null,
        score: 0.9
      }
    ]);

    expect(html.indexOf("High score paper")).toBeLessThan(html.indexOf("Low score paper"));
  });

  it("hides unavailable metadata and omits match context", () => {
    const html = renderEmail([
      {
        journal: "Science",
        title: "Heat risk and urban shade",
        abstract: "",
        url: "https://example.test/heat",
        publishedAt: null,
        score: 0.8,
        matchContext: {
          bestMatchSource: "profile",
          bestMatchTitle: null,
          bestMatchTopics: ["urban heat", "shade equity"]
        }
      }
    ]);

    expect(html).not.toContain("Matched your interests");
    expect(html).not.toContain("urban heat, shade equity");
    expect(html).not.toContain("Unknown date");
    expect(html).not.toContain("Authors unavailable");
    expect(html).not.toContain("Abstract:");
    expect(html).toContain("No abstract provided.");
    expect(html).not.toContain(">Title:</strong>");
  });
});

describe("sendEmail", () => {
  const delivery: DeliveryConfig = {
    mode: "smtp",
    from: "sender@example.test",
    to: "receiver@example.test",
    smtpHost: "smtp.example.test",
    smtpPort: 465,
    smtpPassword: "sender-password"
  };

  beforeEach(() => {
    mock.clearAllMocks();
  });

  it("configures bounded SMTP timeouts and sends to the configured receiver", async () => {
    const sendMail = mock().mockResolvedValue({
      messageId: "message-id",
      accepted: ["receiver@example.test"]
    });
    const createTransport = mock(() => ({ sendMail } as never));

    const result = await sendEmail(delivery, "<p>Hello</p>", "Subject", createTransport);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.test",
        port: 465,
        secure: true,
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000
      })
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "\"Daily Paper Feeds\" <sender@example.test>",
        to: "receiver@example.test",
        subject: "Subject",
        html: "<p>Hello</p>",
        attachments: [
          expect.objectContaining({
            filename: "paper-daily-feed-icon.png",
            cid: "paper-daily-feed-icon",
            contentDisposition: "inline"
          })
        ]
      })
    );
    expect(result).toMatchObject({
      messageId: "message-id",
      accepted: ["receiver@example.test"]
    });
  });

  it("retries a refused SMTP connection before giving up", async () => {
    const connectionError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ESOCKET",
      command: "CONN"
    });
    const sendMail = mock()
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce({
        messageId: "message-id-after-retry",
        accepted: ["receiver@example.test"]
      });
    const createTransport = mock(() => ({ sendMail } as never));
    const sleep = mock(() => Promise.resolve());

    const result = await sendEmail(delivery, "<p>Hello</p>", "Subject", createTransport, sleep);

    expect(createTransport).toHaveBeenCalledTimes(2);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(result).toMatchObject({ messageId: "message-id-after-retry" });
  });

  it("limits SMTP connection retries and preserves the final error", async () => {
    const connectionError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ESOCKET",
      command: "CONN"
    });
    const sendMail = mock().mockRejectedValue(connectionError);
    const createTransport = mock(() => ({ sendMail } as never));
    const sleep = mock(() => Promise.resolve());

    await expect(
      sendEmail(delivery, "<p>Hello</p>", "Subject", createTransport, sleep)
    ).rejects.toBe(connectionError);

    expect(createTransport).toHaveBeenCalledTimes(3);
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 5_000);
  });

  it("does not retry failures after the SMTP connection is established", async () => {
    const authenticationError = Object.assign(new Error("Invalid login"), {
      code: "EAUTH",
      command: "AUTH"
    });
    const sendMail = mock().mockRejectedValue(authenticationError);
    const createTransport = mock(() => ({ sendMail } as never));
    const sleep = mock(() => Promise.resolve());

    await expect(
      sendEmail(delivery, "<p>Hello</p>", "Subject", createTransport, sleep)
    ).rejects.toBe(authenticationError);

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("throws a clear error when a required delivery value is missing", async () => {
    await expect(sendEmail({ ...delivery, from: "" }, "<p>Hello</p>", "Subject")).rejects.toThrow(
      "Missing required delivery value: from."
    );
  });

  it("throws a clear error when smtpPort is not a valid number", async () => {
    await expect(
      sendEmail({ ...delivery, smtpPort: Number.NaN }, "<p>Hello</p>", "Subject")
    ).rejects.toThrow("Expected delivery value smtpPort to be a number.");
  });
});
