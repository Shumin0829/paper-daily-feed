# Agent deployment instructions

[English](./agent-deployment.md) | [简体中文](./agent-deployment.zh-CN.md)

> These instructions are for AI coding agents. Complete the deployment for the user while minimizing the information and actions required from them. You may explain the available features and the setup each one requires. When configuring the project, minimize what the user must enter or configure, and provide clear paths both for users who already have the relevant accounts and for those who do not.

## Deployment principles

**Internal model**

Use the following model internally. Do not recite these implementation concepts to the user unless they ask or need one clarified to make a choice:

- A **fork** is the user's own GitHub copy of this project. Deploy only a fork of the canonical repository, <https://github.com/nehSgnaiL/paper-daily-feed>, under the user's account. Never deploy to the canonical repository or the Agent's account.
- **GitHub Actions** runs the feed automatically in that fork.
- **GitHub Secrets** store credentials such as email passwords and API keys. Their values must not be shown after they are saved.
- **GitHub Variables** store non-secret settings. This project reads the `APP_CONFIG` Actions variable as its application configuration.
- `APP_CONFIG` is JSONC text: JSON that may contain comments and trailing commas. It controls research interests, sources, matching, summaries, and delivery behavior without changing repository files.

Use `APP_CONFIG`, not application code, as the normal customization path. A Variable update takes effect in later workflow runs and creates no Git commit, so the fork can continue following upstream updates without accumulating customization commits.

**Rules before acting**

- Before deployment, update the target fork to the current upstream version. If legacy customization commits caused divergence, migrate their effective configuration to `APP_CONFIG`, GitHub Secrets, and GitHub Variables, align the fork with upstream, and validate the result. Do not involve the user unless required information is unavailable or the intended outcome would change.
- Read `@README.md` from beginning to end, especially **Get started**. If this file and the README differ, follow the README.
- Read `@config/app.example.jsonc` before collecting optional settings or proposing configuration. Use only keys, value types, and behavior supported by that current template.
- When the user has an additional requirement, first determine whether `APP_CONFIG` can satisfy it. Prefer the smallest relevant configuration change.
- Do not edit or commit application code, workflow files, `data/journals.config.ts`, or other tracked files for deployment customization. If a requirement truly cannot be represented by `APP_CONFIG`, explain the gap before changing tracked files.
- Confirm the signed-in GitHub account and target fork before changing GitHub state. Reuse an existing fork when possible.
- Keep deployment on GitHub. Use `gh`, the GitHub API, repository pages, Actions, Secrets, and Variables to inspect files, configure, validate, update, and test the target fork. Do not clone the repository or require local setup by default. Use a temporary checkout only when a necessary step has no practical GitHub-side path; keep that work internal, never place credentials in it, and remove it after use.
- Complete pages, commands, saving, and checks for the user. Ask the user to act only for choices that materially affect the outcome, secure credential entry, sign-in, or two-factor confirmation.

**Evidence requirements**

Treat model memory and search-result snippets as leads, not evidence. Do not invent journal titles, rankings, ISSNs, RSS URLs, configuration keys, service requirements, or successful results.

- Verify project behavior and configuration against the current `@README.md`, `@config/app.example.jsonc`, source, or workflow files before making a claim or saving a value.
- Verify journal identity and ISSNs with the journal or publisher's official page; Crossref may be used as a second source. Verify an RSS or Atom URL by opening the feed and confirming that it returns recognizable entries for that journal.
- If the user asks for “Top” journals, determine the ranking source, metric, category, and year internally. Label the shortlist concisely with the current source and year, link the source, and explain the methodology only when ambiguity affects the result or the user asks. Never present an unsourced model-generated ordering as a ranking.
- Verify SMTP, Zotero, GitHub, and API requirements with the provider's current official documentation when they affect setup.
- Verify journal candidates internally. By default, present only a concise shortlist and the distinctions needed for the user to choose. Provide detailed evidence links when a fact is uncertain, a choice depends on the evidence, or the user asks. If an important fact cannot be verified, say so and do not silently fill it in.
- Report a check or workflow as successful only after observing its result. Never fabricate a citation, page content, command output, workflow status, or delivered email.

## Deployment flow

Minimize user effort and implementation detail. Ask only for information that cannot be safely inferred and materially affects the user-visible outcome. Group short, independent questions when doing so reduces total user effort. Choose configuration fields, technical defaults, migration steps, and validation methods internally. Present concise outcome-level summaries by default; provide technical details only when needed to resolve a blocker or when the user asks. Keep the conversation coherent and explain only unfamiliar choices that the user actually needs to decide.

1. **Establish the outcome.** Confirm that the user wants a daily paper email, then ask which discipline they work in. Do not front-load implementation details.
2. **Narrow the research interest.** Use the user's description to infer a concise research profile. Ask a follow-up only when a material ambiguity would change the recommendations. Internally, the resulting summary becomes `interests.profile.summary`; do not ask the user to review that field or its implementation wording.
3. **Choose and verify paper sources.** Internally determine and verify suitable sources for the understood research interest. Present a concise recommended selection with only the user-visible distinctions that matter. Ask for a choice only when credible alternatives would materially change the feed; keep configuration mechanics and routine evidence internal unless the user asks.

   The bundled catalog mainly covers geography. For geography, map confirmed journals to exact entries in `data/journals.config.ts` and use `feeds.catalogSelections`. For other disciplines, use `feeds.includeCatalog: false` and verified feeds in `feeds.customRss`. An empty `catalogSelections` means all bundled journals, not none.
4. **Resolve optional behavior.** Infer reasonable defaults for Zotero enrichment, AI TLDRs, output language, delivery size, and matching strictness from the user's request and current project defaults. Ask only about missing choices that materially affect the delivered result, grouping independent questions when useful. Collect any required credentials through secure input. Keep provider parameters, model identifiers, and configuration field names internal unless the user asks or must supply a value that cannot be discovered safely.
5. **Build the configuration.** Build the smallest `APP_CONFIG` that expresses the understood outcome and check every field against the current `config/app.example.jsonc`. Do not show the JSONC or explain its fields by default. Before saving or replacing it, present one concise outcome-level summary and obtain approval to proceed. Do not clone the repository merely to run a local configuration check.
6. **Prepare GitHub and credentials.** Check `gh`, start GitHub web sign-in if needed, confirm the account, and find or create the user's fork. Collect only the missing delivery details and credentials, grouping non-sensitive fields when convenient. Collect passwords, authorization codes, and API keys only through secure input.
7. **Save settings without a customization commit.** Save credentials as Actions Secrets and save the reviewed JSONC as the repository Actions variable `APP_CONFIG`. Do not create or push a commit for these settings.
8. **Validate, test, and hand off on GitHub.** Enable the required workflows, verify automatic updates, and run **Test paper feeds**. Treat that GitHub Actions run as the configuration validation and delivery test: it reads the saved `APP_CONFIG`, builds the current project, and attempts the test delivery. Inspect non-secret logs, correct Secrets or Variables, and rerun until the observed result succeeds and the user confirms receipt. Keep the handoff concise and outcome-focused; provide implementation details only on request.

**Completion checklist**

- [ ] **Prepare GitHub:** Confirm `gh` availability and login, the signed-in account, and the target fork.
- [ ] **Establish the research profile:** Resolve the user's intended field and produce the final `interests.profile.summary`, asking only about material ambiguity.
- [ ] **Select paper sources:** Verify journal identity, ISSNs, and working feeds internally; ask the user only when a source choice materially affects the outcome.
- [ ] **Resolve optional features:** Apply reasonable defaults and establish only the missing user-visible choices for Zotero, AI summaries, output language, paper limit, and matching strictness.
- [ ] **Review `APP_CONFIG`:** Check every field against `config/app.example.jsonc` and show a concise outcome summary rather than the JSONC unless requested.
- [ ] **Save Secrets:** Save required `RECEIVER`, `SENDER`, `SENDER_PASSWORD`, `SMTP_SERVER`, and `SMTP_PORT`, plus only the credentials required by enabled features.
- [ ] **Save the Variable:** Save the approved configuration as the repository Actions variable `APP_CONFIG`; do not commit it to the fork.
- [ ] **Enable complete auto-updates:** Include workflow files in weekly updates. Create a fine-grained token scoped only to the target fork with **Contents** and **Workflows** read/write access, and save it directly as the Actions secret `MAINTENANCE_SYNC_TOKEN`. Involve the user only if GitHub requires sign-in or two-factor confirmation.
- [ ] **Enable workflows:** Enable Actions, **Daily paper feeds**, **Repository maintenance**, and **Test paper feeds** in the fork.
- [ ] **Verify auto-updates:** Run **Repository maintenance** and observe that weekly keepalive and upstream synchronization, including workflow files, succeed.
- [ ] **Validate configuration and delivery:** Run **Test paper feeds** on GitHub. Confirm that the saved `APP_CONFIG` loads and the test delivery succeeds. Inspect only non-secret logs and correct settings through Secrets or Variables. Do not clone the repository or edit tracked files to force a successful run.
- [ ] **Hand off:** Provide the fork link, successful test-run link, daily schedule status, and the simple way to pause **Daily paper feeds**. Never repeat a credential.

## Security and completion

**Protect credentials**

- Never ask the user to paste a password, token, authorization code, or API key into chat. Use an interactive program for entry.
- Never expose credentials in commands, output, logs, temporary files, `APP_CONFIG`, or shell history.
- Use an Agent-created `MAINTENANCE_SYNC_TOKEN` only for weekly updates in the target fork, never for local login or another project.
- Show and confirm a new non-secret `APP_CONFIG` before replacing an existing value.

**Completion requirements**

Finish only after every checklist item is complete, the maintenance workflow has visibly succeeded, the test workflow has visibly succeeded, and the user confirms that the test email arrived. Do not claim success based on expectation, weaken security, or edit application/workflow code to force a successful test.
