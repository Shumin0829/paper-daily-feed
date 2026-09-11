import { describe, expect, it, mock, spyOn } from "bun:test";
import {
  enrichFeedPaperMetadata,
  enrichRecommendationAbstracts
} from "../src/paper-metadata.js";
import type { FeedPaper, RecommendedPaper } from "../src/types.js";

function paper(overrides: Partial<FeedPaper> = {}): FeedPaper {
  return {
    journal: "AAAG",
    title: "RSS title",
    abstract: "RSS abstract",
    url: "https://www.tandfonline.com/doi/full/10.1080/24694452.2025.2592754?af=R",
    publishedAt: null,
    ...overrides
  };
}

describe("metadata enrichment", () => {
  it("uses Crossref metadata without replacing the configured journal label", async () => {
    const fetchCrossref = mock(async () => ({
      doi: "10.1080/24694452.2025.2592754",
      title: "Crossref title",
      abstract: "Crossref abstract with enough detail to replace the RSS description.",
      authors: ["Ada Lovelace"],
      firstAffiliation: "Department of Geography, Example University",
      journal: "Annals of the American Association of Geographers",
      publishedAt: new Date("2026-04-21T00:00:00.000Z"),
      url: "https://doi.org/10.1080/24694452.2025.2592754"
    }));

    const enriched = await enrichFeedPaperMetadata(
      [paper()],
      { enabled: true, crossref: { enabled: true, mailto: "" } },
      { fetchCrossref }
    );

    expect(fetchCrossref).toHaveBeenCalledWith("10.1080/24694452.2025.2592754");
    expect(enriched).toEqual([
      {
        journal: "AAAG",
        title: "Crossref title",
        abstract: "Crossref abstract with enough detail to replace the RSS description.",
        url: "https://www.tandfonline.com/doi/full/10.1080/24694452.2025.2592754?af=R",
        doi: "10.1080/24694452.2025.2592754",
        publishedAt: new Date("2026-04-21T00:00:00.000Z"),
        authors: ["Ada Lovelace"],
        firstAffiliation: "Department of Geography, Example University"
      }
    ]);
  });

  it("leaves RSS metadata unchanged when no DOI is available", async () => {
    const fetchCrossref = mock();

    const enriched = await enrichFeedPaperMetadata(
      [paper({ url: "https://example.test/no-doi" })],
      { enabled: true, crossref: { enabled: true, mailto: "" } },
      { fetchCrossref }
    );

    expect(fetchCrossref).not.toHaveBeenCalled();
    expect(enriched).toEqual([paper({ url: "https://example.test/no-doi" })]);
  });

  it("does not replace RSS abstracts with Crossref placeholder text", async () => {
    const fetchCrossref = mock(async () => ({
      doi: "10.1080/24694452.2025.2592754",
      abstract: "."
    }));

    const enriched = await enrichFeedPaperMetadata(
      [paper({ abstract: "RSS abstract with useful text." })],
      { enabled: true, crossref: { enabled: true, mailto: "" } },
      { fetchCrossref }
    );

    expect(enriched[0]?.abstract).toBe("RSS abstract with useful text.");
  });

  it("does not merge a Crossref record whose DOI differs from the requested DOI", async () => {
    const original = paper({ authors: ["RSS Author"], firstAffiliation: "RSS University" });
    const enriched = await enrichFeedPaperMetadata(
      [original],
      { enabled: true, crossref: { enabled: true, mailto: "" } },
      {
        fetchCrossref: mock(async () => ({
          doi: "10.1080/different",
          authors: ["Wrong Author"],
          firstAffiliation: "Wrong University"
        }))
      }
    );

    expect(enriched).toEqual([original]);
  });
});

function recommendation(overrides: Partial<RecommendedPaper> = {}): RecommendedPaper {
  return {
    ...paper({
      title: "Street Networks and Urban Resilience",
      abstract: "",
      url: "https://example.test/paper",
      publishedAt: new Date("2026-05-11T00:00:00.000Z")
    }),
    score: 0.8,
    matchContext: null,
    ...overrides
  };
}

const enrichmentConfig = {
  enabled: true,
  crossref: { enabled: true, mailto: "maintainer@example.test" }
};

describe("selected recommendation abstract enrichment", () => {
  it("uses an exact DOI lookup only for selected recommendations with missing abstracts", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    const fetchCrossref = mock(async () => ({
      doi: "10.1016/j.cities.2026.105952",
      abstract: "Crossref supplies a detailed abstract for the selected recommendation."
    }));
    const searchCrossref = mock();
    const missing = recommendation({
      doi: "10.1016/j.cities.2026.105952",
      url: "https://doi.org/10.1016/j.cities.2026.105952"
    });
    const complete = recommendation({ title: "Already complete", abstract: "An existing useful abstract remains unchanged." });

    const enriched = await enrichRecommendationAbstracts(
      [missing, complete],
      enrichmentConfig,
      { fetchCrossref, searchCrossref }
    );

    expect(fetchCrossref).toHaveBeenCalledTimes(1);
    expect(fetchCrossref).toHaveBeenCalledWith("10.1016/j.cities.2026.105952");
    expect(searchCrossref).not.toHaveBeenCalled();
    expect(enriched[0]?.abstract).toBe(
      "Crossref supplies a detailed abstract for the selected recommendation."
    );
    expect(enriched[1]).toEqual(complete);
    expect(log).toHaveBeenCalledWith(
      "[paper-metadata] Crossref selected metadata enrichment checking 1 DOI records; 1/2 missing abstracts"
    );
    expect(log).toHaveBeenCalledWith(
      "[paper-metadata] Crossref selected metadata enrichment matched 1/1 DOI records; supplemented 1/1 abstracts; 0 remain without abstracts"
    );
    log.mockRestore();
  });

  it("uses an exact DOI match to replace authors and first affiliation even when the abstract exists", async () => {
    const fetchCrossref = mock(async () => ({
      doi: "10.1080/13658816.2026.2613291",
      journal: "International Journal of Geographical Information Science",
      authors: [
        "Aneesha Fernando",
        "Surangika Ranathunga",
        "Kristin Stock",
        "Raj Prasanna",
        "Christopher B. Jones"
      ],
      firstAffiliation: "School of Computational and Mathematical Sciences, Massey University"
    }));
    const selected = recommendation({
      title: "Georeferencing complex relative locality descriptions with large language models",
      abstract: "A complete RSS abstract that must remain available after metadata repair.",
      url: "https://www.tandfonline.com/doi/full/10.1080/13658816.2026.2613291?af=R",
      authors: ["Polluted author and biography metadata"],
      firstAffiliation: "Polluted affiliation and biography metadata"
    });

    const [enriched] = await enrichRecommendationAbstracts(
      [selected],
      enrichmentConfig,
      { fetchCrossref, searchCrossref: mock() }
    );

    expect(fetchCrossref).toHaveBeenCalledWith("10.1080/13658816.2026.2613291");
    expect(enriched).toMatchObject({
      journal: "AAAG",
      abstract: selected.abstract,
      authors: [
        "Aneesha Fernando",
        "Surangika Ranathunga",
        "Kristin Stock",
        "Raj Prasanna",
        "Christopher B. Jones"
      ],
      firstAffiliation: "School of Computational and Mathematical Sciences, Massey University"
    });
  });

  it("uses a high-confidence bibliographic match when the selected paper has no DOI", async () => {
    const searchCrossref = mock(async () => [
      {
        doi: "10.1016/j.cities.wrong",
        title: "Street Networks and Urban Resilience",
        journal: "Unrelated Journal",
        publishedAt: new Date("2026-05-01T00:00:00.000Z"),
        abstract: "This wrong-journal abstract is detailed enough but must not be selected."
      },
      {
        doi: "10.1016/j.cities.2026.105952",
        title: "Street networks & urban resilience",
        journal: "Annals of the American Association of Geographers",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        abstract: "The matched Crossref record provides a useful abstract for this recommendation."
      }
    ]);

    const [enriched] = await enrichRecommendationAbstracts(
      [recommendation()],
      enrichmentConfig,
      { fetchCrossref: mock(), searchCrossref }
    );

    expect(searchCrossref).toHaveBeenCalledWith(
      "Street Networks and Urban Resilience AAAG 2026"
    );
    expect(enriched?.doi).toBe("10.1016/j.cities.2026.105952");
    expect(enriched?.abstract).toBe(
      "The matched Crossref record provides a useful abstract for this recommendation."
    );
  });

  it("keeps the selected paper unchanged when Crossref has no high-confidence abstract match", async () => {
    const selected = recommendation();
    const [enriched] = await enrichRecommendationAbstracts(
      [selected],
      enrichmentConfig,
      {
        searchCrossref: mock(async () => [
          {
            doi: "10.1000/unrelated",
            title: "A Different Urban Research Paper",
            journal: "AAAG",
            publishedAt: new Date("2026-01-01T00:00:00.000Z"),
            abstract: "A detailed but unrelated abstract that must never be copied into the recommendation."
          }
        ])
      }
    );

    expect(enriched).toEqual(selected);
  });
});
