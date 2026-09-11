import type { MetadataEnrichmentConfig, MetadataRepairConfig } from "./app-config.js";
import {
  fetchCrossrefWork,
  findDoi,
  searchCrossrefWorks,
  type CrossrefMetadata
} from "./crossref.js";
import type { FeedPaper, RecommendedPaper } from "./types.js";
import { hasMeaningfulAbstract } from "./text.js";

type EnrichmentDependencies = {
  fetchCrossref?: (doi: string) => Promise<CrossrefMetadata | null>;
};

type RecommendationAbstractEnrichmentDependencies = EnrichmentDependencies & {
  searchCrossref?: (bibliographicQuery: string) => Promise<CrossrefMetadata[]>;
};

type NerEntity = {
  entity?: string;
  entity_group?: string;
  word?: string;
};

type NerPipeline = (text: string) => Promise<NerEntity[]>;
type LoadNerPipeline = (model: string) => Promise<NerPipeline>;

const ORG_WORDS =
  /\b(?:University|Department|School|Institute|Laboratory|Centre|Center|Research|College|Faculty|Business)\b/i;

function paperDoi(paper: FeedPaper): string | undefined {
  return paper.doi ?? findDoi([paper.url, paper.metadataText, paper.title].filter(Boolean).join(" "));
}

function doiMatches(requestedDoi: string, metadata: CrossrefMetadata): boolean {
  return requestedDoi.toLowerCase() === metadata.doi.toLowerCase();
}

function mergeCrossrefMetadata<TPaper extends FeedPaper>(paper: TPaper, metadata: CrossrefMetadata): TPaper {
  return {
    ...paper,
    doi: metadata.doi,
    title: metadata.title ?? paper.title,
    journal: paper.journal,
    abstract: hasMeaningfulAbstract(metadata.abstract) ? metadata.abstract : paper.abstract,
    publishedAt: metadata.publishedAt ?? paper.publishedAt,
    ...(metadata.authors?.length ? { authors: metadata.authors } : {}),
    ...(metadata.firstAffiliation?.trim() ? { firstAffiliation: metadata.firstAffiliation.trim() } : {})
  } as TPaper;
}

/** Applies inexpensive metadata precedence before matching. */
export async function enrichFeedPaperMetadata(
  papers: FeedPaper[],
  config: MetadataEnrichmentConfig,
  dependencies: EnrichmentDependencies = {}
): Promise<FeedPaper[]> {
  if (!config.enabled || !config.crossref.enabled || papers.length === 0) return papers;

  const fetchCrossref =
    dependencies.fetchCrossref ?? ((doi: string) => fetchCrossrefWork(doi, { mailto: config.crossref.mailto }));
  const enriched: FeedPaper[] = [];
  let repaired = 0;
  for (const paper of papers) {
    const doi = paperDoi(paper);
    if (!doi) {
      enriched.push(paper);
      continue;
    }
    try {
      const metadata = await fetchCrossref(doi);
      if (metadata && doiMatches(doi, metadata)) {
        enriched.push(mergeCrossrefMetadata(paper, metadata));
        repaired += 1;
      } else {
        enriched.push(paper);
      }
    } catch (error) {
      console.log(`[paper-metadata] Crossref skipped for ${doi}: ${error instanceof Error ? error.message : String(error)}`);
      enriched.push(paper);
    }
  }
  console.log(`[paper-metadata] Crossref enriched ${repaired}/${papers.length} papers`);
  return enriched;
}

function normalizedBibliographicText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function bibliographicSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizedBibliographicText(left);
  const normalizedRight = normalizedBibliographicText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  return 1 - editDistance(normalizedLeft, normalizedRight) / Math.max(normalizedLeft.length, normalizedRight.length);
}

function bibliographicAcronym(value: string): string {
  const stopWords = new Set(["a", "an", "and", "for", "in", "of", "on", "the", "to"]);
  return normalizedBibliographicText(value)
    .split(" ")
    .filter((word) => word && !stopWords.has(word))
    .map((word) => word[0])
    .join("");
}

function journalsMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizedBibliographicText(left);
  const normalizedRight = normalizedBibliographicText(right);
  if (bibliographicSimilarity(left, right) >= 0.8) return true;
  const leftAcronym = bibliographicAcronym(left);
  const rightAcronym = bibliographicAcronym(right);
  return (
    (normalizedLeft.length <= 8 && normalizedLeft.replace(/ /g, "") === rightAcronym) ||
    (normalizedRight.length <= 8 && normalizedRight.replace(/ /g, "") === leftAcronym)
  );
}

function isHighConfidenceMatch(paper: RecommendedPaper, candidate: CrossrefMetadata): boolean {
  if (!candidate.title || bibliographicSimilarity(paper.title, candidate.title) < 0.95) return false;

  const paperYear = paper.publishedAt?.getUTCFullYear();
  const candidateYear = candidate.publishedAt?.getUTCFullYear();
  if (paperYear && candidateYear && paperYear !== candidateYear) return false;

  if (
    paper.journal &&
    candidate.journal &&
    !journalsMatch(paper.journal, candidate.journal)
  ) {
    return false;
  }
  return true;
}

function bibliographicQuery(paper: RecommendedPaper): string {
  return [paper.title, paper.journal, paper.publishedAt?.getUTCFullYear()].filter(Boolean).join(" ");
}

/** Applies exact-DOI display metadata and supplements abstracts for papers selected for delivery. */
export async function enrichRecommendationAbstracts(
  recommendations: RecommendedPaper[],
  config: MetadataEnrichmentConfig,
  dependencies: RecommendationAbstractEnrichmentDependencies = {}
): Promise<RecommendedPaper[]> {
  if (recommendations.length === 0) return recommendations;
  if (!config.enabled || !config.crossref.enabled) {
    console.log("[paper-metadata] Crossref selected metadata enrichment skipped; metadata enrichment is disabled");
    return recommendations;
  }

  const missingCount = recommendations.filter((paper) => !hasMeaningfulAbstract(paper.abstract)).length;
  const doiCount = recommendations.filter((paper) => Boolean(paperDoi(paper))).length;
  console.log(
    `[paper-metadata] Crossref selected metadata enrichment checking ${doiCount} DOI records; ${missingCount}/${recommendations.length} missing abstracts`
  );
  const fetchCrossref =
    dependencies.fetchCrossref ??
    ((doi: string) => fetchCrossrefWork(doi, { mailto: config.crossref.mailto }));
  const searchCrossref =
    dependencies.searchCrossref ??
    ((query: string) => searchCrossrefWorks(query, { mailto: config.crossref.mailto }));
  let supplemented = 0;
  let exactMatches = 0;
  const enriched: RecommendedPaper[] = [];

  for (const paper of recommendations) {
    const missingAbstract = !hasMeaningfulAbstract(paper.abstract);
    const doi = paperDoi(paper);
    if (!doi && !missingAbstract) {
      enriched.push(paper);
      continue;
    }

    try {
      const candidate = doi
        ? await fetchCrossref(doi)
        : (await searchCrossref(bibliographicQuery(paper))).find(
            (candidate) => hasMeaningfulAbstract(candidate.abstract) && isHighConfidenceMatch(paper, candidate)
          ) ?? null;

      if (doi) {
        const metadata = candidate && doiMatches(doi, candidate) ? candidate : null;
        if (metadata) {
          exactMatches += 1;
          enriched.push(mergeCrossrefMetadata(paper, metadata));
          if (missingAbstract && hasMeaningfulAbstract(metadata.abstract)) supplemented += 1;
        } else {
          enriched.push(paper);
        }
      } else if (candidate && hasMeaningfulAbstract(candidate.abstract)) {
        enriched.push({ ...paper, doi: candidate.doi, abstract: candidate.abstract });
        supplemented += 1;
      } else {
        enriched.push(paper);
      }
    } catch (error) {
      console.log(
        `[paper-metadata] Crossref selected metadata lookup failed for ${doi ? `DOI ${doi}` : `title "${paper.title}"`}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      enriched.push(paper);
    }
  }

  console.log(
    `[paper-metadata] Crossref selected metadata enrichment matched ${exactMatches}/${doiCount} DOI records; supplemented ${supplemented}/${missingCount} abstracts; ${missingCount - supplemented} remain without abstracts`
  );
  return enriched;
}

function compact(value: string): string {
  return value.replace(/^##/, "").replace(/\s+/g, " ").trim();
}

function entityKind(entity: NerEntity): string {
  return (entity.entity_group ?? entity.entity ?? "").replace(/^[BI]-/, "").toUpperCase();
}

function groups(entities: NerEntity[], kind: "PER" | "ORG"): string[] {
  const values: string[] = [];
  let current = "";
  for (const entity of entities) {
    if (entityKind(entity) !== kind || !entity.word) {
      if (current) values.push(current);
      current = "";
      continue;
    }
    const word = compact(entity.word);
    if (!word) continue;
    const startsGroup = entity.entity?.startsWith("B-") || Boolean(entity.entity_group && !entity.entity);
    if (startsGroup && current) {
      values.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) values.push(current);
  return values.map(compact).filter(Boolean);
}

function shouldUseAuthors(authors: string[] | undefined, current: string[] | undefined): authors is string[] {
  return Boolean(
    authors?.length &&
      authors.length >= (current?.length ?? 0) &&
      authors.every((author) => author.split(/\s+/).length >= 2) &&
      authors.join(" ").length >= (current?.join(" ").length ?? 0) * 0.6
  );
}

function shouldUseAffiliation(affiliation: string | undefined, current: string | undefined): affiliation is string {
  return Boolean(affiliation && ORG_WORDS.test(affiliation) && affiliation.length > Math.max(12, current?.length ?? 0));
}

function rawMetadata(paper: RecommendedPaper): string {
  return paper.metadataText || [paper.authors?.join(", "), paper.firstAffiliation].filter(Boolean).join(" ");
}

async function defaultLoadNerPipeline(model: string): Promise<NerPipeline> {
  const { pipeline } = await import("@huggingface/transformers");
  return (await pipeline("token-classification", model)) as NerPipeline;
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("metadata repair timeout")), timeoutMs);
    work.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

async function repairSelectedMetadata(
  recommendations: RecommendedPaper[],
  loadNerPipeline: LoadNerPipeline,
  model: string
): Promise<RecommendedPaper[]> {
  console.log(`[paper-metadata] loading NER model ${model}`);
  const ner = await loadNerPipeline(model);
  const repaired: RecommendedPaper[] = [];
  let repairedAuthors = 0;
  let repairedAffiliations = 0;
  for (const paper of recommendations) {
    const entities = await ner(rawMetadata(paper));
    const authors = groups(entities, "PER");
    const affiliation = groups(entities, "ORG")
      .sort((left, right) => right.length - left.length)
      .find((value) => shouldUseAffiliation(value, paper.firstAffiliation));
    const useAuthors = shouldUseAuthors(authors, paper.authors);
    if (useAuthors) repairedAuthors += 1;
    if (affiliation) repairedAffiliations += 1;
    repaired.push({
      ...paper,
      ...(useAuthors ? { authors } : {}),
      ...(affiliation ? { firstAffiliation: affiliation } : {})
    });
  }
  console.log(
    `[paper-metadata] NER repaired authors for ${repairedAuthors}/${recommendations.length}, affiliations for ${repairedAffiliations}/${recommendations.length}`
  );
  return repaired;
}

/** Applies expensive NER repair only after Recommendations have been selected. */
export async function repairRecommendationMetadata(
  recommendations: RecommendedPaper[],
  config: MetadataRepairConfig,
  loadNerPipeline: LoadNerPipeline = defaultLoadNerPipeline
): Promise<RecommendedPaper[]> {
  if (!config.enabled || recommendations.length === 0) return recommendations;
  try {
    return await withTimeout(
      repairSelectedMetadata(recommendations, loadNerPipeline, config.model),
      config.timeoutMs
    );
  } catch (error) {
    console.log(`[paper-metadata] NER skipped: ${error instanceof Error ? error.message : String(error)}`);
    return recommendations;
  }
}
