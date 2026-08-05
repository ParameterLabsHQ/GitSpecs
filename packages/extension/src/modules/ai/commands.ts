import * as vscode from "vscode";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { bindCommand } from "../../shell/bindCommand.js";
import { presentError } from "../../shell/errors.js";
import { buildCommitMessagePrompt, buildExplainCommitPrompt } from "./prompts.js";
import { chatCompletion } from "./client.js";

const AI_KEY = "gitspecs.ai.apiKey";
const CONSENT_KEY = "gitspecs.ai.consent";

export function registerAiCommands(
  context: vscode.ExtensionContext,
  repos: RepoContext,
  log: PlatformLog,
): void {
  const run = <TArgs extends unknown[]>(fn: (...args: TArgs) => Promise<void>) =>
    bindCommand(fn, {
      onSuccess: () => {},
      onError: (err) => presentError(log, err),
    });

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitspecs.ai.configure",
      run(async () => {
        const endpoint = await vscode.window.showInputBox({
          title: "AI endpoint (OpenAI-compatible)",
          value:
            vscode.workspace.getConfiguration("gitspecs").get<string>("ai.endpoint") ||
            "https://api.openai.com/v1",
          ignoreFocusOut: true,
        });
        if (!endpoint) return;
        const model = await vscode.window.showInputBox({
          title: "Model id",
          value:
            vscode.workspace.getConfiguration("gitspecs").get<string>("ai.model") ||
            "gpt-4o-mini",
          ignoreFocusOut: true,
        });
        if (!model) return;
        const key = await vscode.window.showInputBox({
          title: "API key (SecretStorage)",
          password: true,
          ignoreFocusOut: true,
        });
        if (key === undefined) return;
        await vscode.workspace
          .getConfiguration("gitspecs")
          .update("ai.endpoint", endpoint.trim(), vscode.ConfigurationTarget.Global);
        await vscode.workspace
          .getConfiguration("gitspecs")
          .update("ai.model", model.trim(), vscode.ConfigurationTarget.Global);
        if (key.trim()) await context.secrets.store(AI_KEY, key.trim());
        else await context.secrets.delete(AI_KEY);
        void vscode.window.showInformationMessage("GitSpecs: AI provider configured");
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.ai.generateCommitMessage",
      run(async () => {
        if (!(await ensureConfigured(context))) return;
        if (!(await ensureConsent(context))) return;
        const repo = repos.currentRepo;
        if (!repo) return;
        const diff = (
          await repo.exec(["diff", "--cached"], { allowFailure: true })
        ).stdout;
        if (!diff.trim()) {
          void vscode.window.showInformationMessage("No staged changes");
          return;
        }
        const { system, user } = buildCommitMessagePrompt(diff);
        const cfg = await loadConfig(context);
        const text = await chatCompletion(cfg, system, user);
        const accept = await vscode.window.showInformationMessage(
          text.slice(0, 500),
          { modal: true },
          "Copy",
          "Commit with message",
        );
        if (accept === "Copy") {
          await vscode.env.clipboard.writeText(text);
        } else if (accept === "Commit with message") {
          await repo.exec(["commit", "-m", text]);
          void vscode.window.showInformationMessage("GitSpecs: committed with AI message");
        }
        log.info("AI generateCommitMessage completed");
      }),
    ),

    vscode.commands.registerCommand(
      "gitspecs.ai.explainCommit",
      run(async () => {
        if (!(await ensureConfigured(context))) return;
        if (!(await ensureConsent(context))) return;
        const repo = repos.currentRepo;
        if (!repo) return;
        const sha = await vscode.window.showInputBox({
          title: "Commit to explain",
          value: "HEAD",
          ignoreFocusOut: true,
        });
        if (!sha?.trim()) return;
        const show = await repo.exec(["show", "--stat", "--format=%s", sha.trim()], {
          allowFailure: true,
        });
        const subject = show.stdout.split("\n")[0] ?? sha;
        const diff = (
          await repo.exec(["show", "--format=", sha.trim()], { allowFailure: true })
        ).stdout;
        const { system, user } = buildExplainCommitPrompt(subject, diff);
        const cfg = await loadConfig(context);
        const text = await chatCompletion(cfg, system, user);
        const doc = await vscode.workspace.openTextDocument({
          content: text,
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
        log.info(`AI explainCommit ${sha.trim().slice(0, 7)}`);
      }),
    ),
  );
}

async function ensureConfigured(context: vscode.ExtensionContext): Promise<boolean> {
  const key = await context.secrets.get(AI_KEY);
  const endpoint = vscode.workspace.getConfiguration("gitspecs").get<string>("ai.endpoint");
  if (!key || !endpoint) {
    void vscode.window.showInformationMessage(
      "Configure AI first (GitSpecs: Configure AI Provider…)",
    );
    return false;
  }
  return true;
}

async function ensureConsent(context: vscode.ExtensionContext): Promise<boolean> {
  const ok = context.globalState.get<boolean>(CONSENT_KEY);
  if (ok) return true;
  const choice = await vscode.window.showWarningMessage(
    "GitSpecs AI will send diff text and file names to your configured provider endpoint. Nothing is sent to GitSpecs servers. Continue?",
    { modal: true },
    "I understand",
  );
  if (choice !== "I understand") return false;
  await context.globalState.update(CONSENT_KEY, true);
  return true;
}

async function loadConfig(context: vscode.ExtensionContext) {
  const apiKey = (await context.secrets.get(AI_KEY)) ?? "";
  const endpoint =
    vscode.workspace.getConfiguration("gitspecs").get<string>("ai.endpoint") ||
    "https://api.openai.com/v1";
  const model =
    vscode.workspace.getConfiguration("gitspecs").get<string>("ai.model") || "gpt-4o-mini";
  return { endpoint, model, apiKey };
}
