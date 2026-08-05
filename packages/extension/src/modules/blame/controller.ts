import * as vscode from "vscode";
import * as path from "node:path";
import type { BlameLine } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { formatLineBlame, formatStatusBarBlame } from "./format.js";
import { BlameCache } from "./cache.js";
import {
  blameDetailActions,
  resolveCommitUrl,
  shouldShowStatusBarBlame,
  toDetailPayload,
  type BlameDetailPayload,
} from "./detail.js";
import {
  HEATMAP_BUCKET_COUNT,
  HEATMAP_BUCKET_COLORS,
  heatmapBucketIndex,
  heatmapDecorationTypeOptions,
} from "./heatmap.js";
import { readAutolinkRules } from "../autolinks/settings.js";
import { enrichTextWithIssues } from "../hosting/commands.js";
import {
  defaultBlameHoverActions,
  formatCombinedBlameHoverMarkdown,
  formatDetailsHoverMarkdown,
} from "./hoverMarkdown.js";

const STATUS_BAR_DEBOUNCE_MS = 200;
const DECORATION_DEBOUNCE_MS = 400;
const CURRENT_LINE_DEBOUNCE_MS = 150;

function isDiskFile(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === "file" && !doc.isUntitled;
}

function isUnderRepo(repoRoot: string, fsPath: string): boolean {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(fsPath);
  return abs === root || abs.startsWith(root + path.sep);
}

export class BlameController implements vscode.Disposable {
  /** Full-file EOL blame annotations. */
  private readonly decorationType: vscode.TextEditorDecorationType;
  /** Current-line EOL blame (independent of full-file toggle). */
  private readonly currentLineType: vscode.TextEditorDecorationType;
  /** Gutter age strip for file blame (one type per heat bucket). */
  private readonly gutterTypes: vscode.TextEditorDecorationType[];
  /**
   * Overview-ruler + gutter heatmap types.
   */
  private readonly heatmapTypes: vscode.TextEditorDecorationType[];
  private readonly statusBar: vscode.StatusBarItem;
  private readonly cache = new BlameCache();
  /** Full-file blame annotations on. */
  private enabled = false;
  private readonly disposables: vscode.Disposable[] = [];
  private decorationTimer: NodeJS.Timeout | undefined;
  private statusBarTimer: NodeJS.Timeout | undefined;
  private currentLineTimer: NodeJS.Timeout | undefined;
  private statusBarSeq = 0;
  private decorationSeq = 0;
  private currentLineSeq = 0;
  private lastStatusPayload: BlameDetailPayload | undefined;
  private lastCurrentLineEditor: vscode.TextEditor | undefined;

  constructor(
    private readonly repos: RepoContext,
    private readonly log: PlatformLog,
  ) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      after: {
        margin: "0 0 0 2em",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
      },
    });
    this.disposables.push(this.decorationType);

    this.currentLineType = vscode.window.createTextEditorDecorationType({
      isWholeLine: false,
      after: {
        margin: "0 0 0 2em",
        color: new vscode.ThemeColor("editorCodeLens.foreground"),
        fontStyle: "italic",
      },
    });
    this.disposables.push(this.currentLineType);

    this.gutterTypes = [];
    for (let i = 0; i < HEATMAP_BUCKET_COUNT; i++) {
      const color = HEATMAP_BUCKET_COLORS[i]!;
      const type = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: "0 0 0 3px",
        borderStyle: "solid",
        borderColor: color,
      });
      this.gutterTypes.push(type);
      this.disposables.push(type);
    }

    this.heatmapTypes = [];
    for (let i = 0; i < HEATMAP_BUCKET_COUNT; i++) {
      const opts = heatmapDecorationTypeOptions(i);
      const type = vscode.window.createTextEditorDecorationType({
        isWholeLine: opts.isWholeLine,
        overviewRulerColor: opts.overviewRulerColor,
        overviewRulerLane: vscode.OverviewRulerLane.Full,
        borderWidth: "0 2px 0 0",
        borderStyle: "solid",
        borderColor: opts.overviewRulerColor,
      });
      this.heatmapTypes.push(type);
      this.disposables.push(type);
    }

    this.statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBar.name = "GitSpecs Blame";
    this.statusBar.command = "gitspecs.blame.statusBarDetails";
    this.statusBar.tooltip = "GitSpecs: current line blame";
    this.disposables.push(this.statusBar);

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (this.enabled) void this.refreshActiveEditor();
        this.scheduleStatusBarRefresh();
        this.scheduleCurrentLineRefresh();
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor === vscode.window.activeTextEditor) {
          this.scheduleStatusBarRefresh();
          this.scheduleCurrentLineRefresh();
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const ed = vscode.window.activeTextEditor;
        if (ed && e.document === ed.document) {
          if (this.enabled) this.scheduleDecorationRefresh();
          this.scheduleStatusBarRefresh();
          this.scheduleCurrentLineRefresh();
        }
        const repo = this.repos.currentRepo;
        if (repo && e.document.uri.scheme === "file") {
          this.cache.invalidate(repo.root, e.document.uri.fsPath);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration("gitspecs.blame.statusBar") ||
          e.affectsConfiguration("gitspecs.currentLine") ||
          e.affectsConfiguration("gitspecs.hovers")
        ) {
          this.scheduleStatusBarRefresh();
          this.scheduleCurrentLineRefresh();
        }
        if (
          (e.affectsConfiguration("gitspecs.blame.heatmap") ||
            e.affectsConfiguration("gitspecs.hovers")) &&
          this.enabled
        ) {
          void this.refreshActiveEditor();
        }
      }),
      this.repos.onDidChange(() => {
        this.cache.clear();
        if (this.enabled) void this.refreshActiveEditor();
        this.scheduleStatusBarRefresh();
        this.scheduleCurrentLineRefresh();
      }),
    );

    this.scheduleStatusBarRefresh();
    this.scheduleCurrentLineRefresh();
  }

  get blameCache(): BlameCache {
    return this.cache;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.clearAllFileBlame();
      void vscode.window.setStatusBarMessage("GitSpecs: File blame off", 2000);
      this.scheduleCurrentLineRefresh();
      return;
    }
    void vscode.window.setStatusBarMessage("GitSpecs: File blame on", 2000);
    await this.refreshActiveEditor();
    this.scheduleCurrentLineRefresh();
  }

  /** Escape / dismiss: turn off file blame and clear annotation modes. */
  async dismissAnnotations(): Promise<void> {
    let cleared = false;
    if (this.enabled) {
      this.enabled = false;
      this.clearAllFileBlame();
      cleared = true;
    }
    // Also clear heatmap-only session by ensuring file blame off
    if (cleared) {
      void vscode.window.setStatusBarMessage("GitSpecs: annotations dismissed", 2000);
    }
    this.scheduleCurrentLineRefresh();
  }

  async toggleCodeLens(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("gitspecs");
    const cur = cfg.get<boolean>("blame.codeLens", true);
    await cfg.update("blame.codeLens", !cur, vscode.ConfigurationTarget.Global);
    void vscode.window.setStatusBarMessage(
      `GitSpecs: CodeLens ${!cur ? "on" : "off"}`,
      2000,
    );
  }

  async showLine(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage("No active editor");
      return;
    }
    const repo = this.repos.currentRepo;
    if (!repo) {
      void vscode.window.showInformationMessage("No Git repository selected");
      return;
    }
    const file = editor.document.uri.fsPath;
    if (!isDiskFile(editor.document)) {
      void vscode.window.showInformationMessage("Blame requires a saved file on disk");
      return;
    }
    const lineNumber = editor.selection.active.line + 1;
    try {
      const versionKey = String(editor.document.version);
      const line = await this.cache.getLine(repo, file, versionKey, lineNumber);
      if (!line) {
        void vscode.window.showInformationMessage("No blame information for this line");
        return;
      }
      await this.showBlameDetail(toDetailPayload(line));
    } catch (err) {
      await presentError(this.log, err, "Blame line");
    }
  }

  async blameFileToOutput(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isDiskFile(editor.document)) {
      void vscode.window.showInformationMessage("Open a file on disk to blame");
      return;
    }
    const repo = this.repos.currentRepo;
    if (!repo) {
      void vscode.window.showInformationMessage("No Git repository selected");
      return;
    }
    try {
      const rows = await this.cache.get(
        repo,
        editor.document.uri.fsPath,
        String(editor.document.version),
      );
      this.log.info(`Blame ${path.basename(editor.document.uri.fsPath)} (${rows.length} lines)`);
      for (const row of rows) {
        this.log.info(`L${row.lineNumber}\t${formatLineBlame(row)}`);
      }
      this.log.show();
    } catch (err) {
      await presentError(this.log, err, "Blame file");
    }
  }

  async showStatusBarDetails(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (editor && isDiskFile(editor.document) && this.repos.currentRepo) {
      await this.showLine();
      return;
    }
    if (this.lastStatusPayload) {
      await this.showBlameDetail(this.lastStatusPayload);
      return;
    }
    void vscode.window.showInformationMessage("No blame information for this line");
  }

  async showBlameDetail(payload: BlameDetailPayload): Promise<void> {
    const repo = this.repos.currentRepo;
    let commitUrlStr: string | undefined;
    if (repo) {
      try {
        const remoteUrl = await repo.branches.getRemoteUrl("origin");
        commitUrlStr = resolveCommitUrl(remoteUrl, payload.sha);
      } catch {
        commitUrlStr = undefined;
      }
    }

    const actions = blameDetailActions(Boolean(commitUrlStr));
    const header = [payload.author, payload.sha.slice(0, 7), payload.summary]
      .filter(Boolean)
      .join(" • ");

    const pick = await vscode.window.showQuickPick(
      actions.map((a) => ({ label: a.label, id: a.id })),
      {
        title: "GitSpecs Blame",
        placeHolder: header,
      },
    );
    if (!pick) return;

    switch (pick.id) {
      case "showMessage": {
        const msg = payload.summary?.trim()
          ? `${payload.summary}\n\n${payload.sha}`
          : `(no commit message)\n\n${payload.sha}`;
        await vscode.window.showInformationMessage(msg, { modal: false });
        break;
      }
      case "copySha":
        await vscode.env.clipboard.writeText(payload.sha);
        void vscode.window.setStatusBarMessage("GitSpecs: SHA copied", 2000);
        break;
      case "openCommitUrl":
        if (commitUrlStr) {
          await vscode.env.openExternal(vscode.Uri.parse(commitUrlStr));
        }
        break;
    }
  }

  private scheduleDecorationRefresh(): void {
    if (this.decorationTimer) clearTimeout(this.decorationTimer);
    this.decorationTimer = setTimeout(() => {
      void this.refreshActiveEditor();
    }, DECORATION_DEBOUNCE_MS);
  }

  private scheduleStatusBarRefresh(): void {
    if (this.statusBarTimer) clearTimeout(this.statusBarTimer);
    this.statusBarTimer = setTimeout(() => {
      void this.refreshStatusBar();
    }, STATUS_BAR_DEBOUNCE_MS);
  }

  private scheduleCurrentLineRefresh(): void {
    if (this.currentLineTimer) clearTimeout(this.currentLineTimer);
    this.currentLineTimer = setTimeout(() => {
      void this.refreshCurrentLine();
    }, CURRENT_LINE_DEBOUNCE_MS);
  }

  private statusBarSettingEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("gitspecs")
      .get<boolean>("blame.statusBar", true);
  }

  private currentLineEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("gitspecs")
      .get<boolean>("currentLine.enabled", true);
  }

  private hoversEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("gitspecs")
      .get<boolean>("hovers.enabled", true);
  }

  private hoverDetailsEnabled(kind: "currentLine" | "annotations"): boolean {
    if (!this.hoversEnabled()) return false;
    const key =
      kind === "currentLine"
        ? "hovers.currentLine.details"
        : "hovers.annotations.details";
    return vscode.workspace.getConfiguration("gitspecs").get<boolean>(key, true);
  }

  private hoverChangesEnabled(kind: "currentLine" | "annotations"): boolean {
    if (!this.hoversEnabled()) return false;
    const key =
      kind === "currentLine"
        ? "hovers.currentLine.changes"
        : "hovers.annotations.changes";
    return vscode.workspace.getConfiguration("gitspecs").get<boolean>(key, true);
  }

  private async buildHoverMarkdown(
    line: BlameLine,
    kind: "currentLine" | "annotations",
    previousLine?: string,
  ): Promise<vscode.MarkdownString | undefined> {
    const details = this.hoverDetailsEnabled(kind);
    const changes = this.hoverChangesEnabled(kind);
    if (!details && !changes) return undefined;

    const rules = readAutolinkRules();
    let enrichedBlock: string | undefined;
    if (line.summary) {
      try {
        const full = await enrichTextWithIssues(this.repos, line.summary, this.log);
        if (full !== line.summary) enrichedBlock = full;
      } catch {
        // offline
      }
    }

    let hasRemote = false;
    const repo = this.repos.currentRepo;
    if (repo) {
      try {
        const remoteUrl = await repo.branches.getRemoteUrl("origin");
        hasRemote = Boolean(resolveCommitUrl(remoteUrl, line.sha));
      } catch {
        hasRemote = false;
      }
    }

    const actions = defaultBlameHoverActions({ hasRemoteUrl: hasRemote });
    const text = formatCombinedBlameHoverMarkdown(line, {
      includeDetails: details,
      includeChanges: changes,
      previousLine,
      previousSha: line.previousSha,
      autolinkRules: rules,
      enrichedBlock,
      actions,
    });
    const md = new vscode.MarkdownString(text, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;
    return md;
  }

  private async refreshCurrentLine(): Promise<void> {
    const seq = ++this.currentLineSeq;
    const editor = vscode.window.activeTextEditor;

    // Clear previous editor's current-line decoration when switching
    if (this.lastCurrentLineEditor && this.lastCurrentLineEditor !== editor) {
      this.lastCurrentLineEditor.setDecorations(this.currentLineType, []);
    }
    this.lastCurrentLineEditor = editor;

    if (!editor || !this.currentLineEnabled()) {
      if (editor) editor.setDecorations(this.currentLineType, []);
      return;
    }
    // When full-file blame is on, avoid double EOL on the current line
    if (this.enabled) {
      editor.setDecorations(this.currentLineType, []);
      return;
    }
    if (!isDiskFile(editor.document)) {
      editor.setDecorations(this.currentLineType, []);
      return;
    }
    const repo =
      this.repos.repoForPath(editor.document.uri.fsPath) ?? this.repos.currentRepo;
    if (!repo || !isUnderRepo(repo.root, editor.document.uri.fsPath)) {
      editor.setDecorations(this.currentLineType, []);
      return;
    }

    const lineNumber = editor.selection.active.line + 1;
    const versionKey = String(editor.document.version);
    try {
      const line = await this.cache.getLine(
        repo,
        editor.document.uri.fsPath,
        versionKey,
        lineNumber,
      );
      if (seq !== this.currentLineSeq) return;
      if (!line) {
        editor.setDecorations(this.currentLineType, []);
        return;
      }

      const range = editor.document.lineAt(editor.selection.active.line).range;
      const hover = await this.buildHoverMarkdown(line, "currentLine", undefined);
      if (seq !== this.currentLineSeq) return;

      editor.setDecorations(this.currentLineType, [
        {
          range,
          renderOptions: {
            after: {
              contentText: formatLineBlame(line),
            },
          },
          hoverMessage: hover,
        },
      ]);
    } catch (err) {
      if (seq !== this.currentLineSeq) return;
      this.log.debug(
        `current line blame failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      editor.setDecorations(this.currentLineType, []);
    }
  }

  private async refreshStatusBar(): Promise<void> {
    const seq = ++this.statusBarSeq;
    const enabled = this.statusBarSettingEnabled();
    const editor = vscode.window.activeTextEditor;
    const repo = this.repos.currentRepo;

    if (
      !shouldShowStatusBarBlame(
        enabled,
        Boolean(repo),
        Boolean(editor && isDiskFile(editor.document)),
        true,
      )
    ) {
      this.lastStatusPayload = undefined;
      this.statusBar.hide();
      this.statusBar.text = "";
      return;
    }

    if (!editor || !repo || !isDiskFile(editor.document)) {
      this.lastStatusPayload = undefined;
      this.statusBar.hide();
      return;
    }

    const fsPath = editor.document.uri.fsPath;
    if (!isUnderRepo(repo.root, fsPath)) {
      this.lastStatusPayload = undefined;
      this.statusBar.hide();
      return;
    }

    const lineNumber = editor.selection.active.line + 1;
    const versionKey = String(editor.document.version);

    try {
      const line = await this.cache.getLine(repo, fsPath, versionKey, lineNumber);
      if (seq !== this.statusBarSeq) return;
      if (!line) {
        this.lastStatusPayload = undefined;
        this.statusBar.hide();
        return;
      }
      this.lastStatusPayload = toDetailPayload(line);
      this.statusBar.text = `$(git-commit) ${formatStatusBarBlame(line)}`;
      const rules = readAutolinkRules();
      let enrichedBlock: string | undefined;
      if (line.summary) {
        try {
          const full = await enrichTextWithIssues(this.repos, line.summary, this.log);
          if (full !== line.summary) enrichedBlock = full;
        } catch {
          // offline
        }
      }
      const tip = formatDetailsHoverMarkdown(line, {
        autolinkRules: rules,
        enrichedBlock,
        actions: defaultBlameHoverActions(),
      });
      this.statusBar.tooltip = new vscode.MarkdownString(tip, true);
      this.statusBar.show();
    } catch (err) {
      if (seq !== this.statusBarSeq) return;
      this.log.debug(
        `status bar blame failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.lastStatusPayload = undefined;
      this.statusBar.hide();
    }
  }

  private async refreshActiveEditor(): Promise<void> {
    const seq = ++this.decorationSeq;
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.enabled) return;
    if (!isDiskFile(editor.document)) {
      this.clearEditorDecorations(editor);
      return;
    }
    const repo =
      this.repos.repoForPath(editor.document.uri.fsPath) ?? this.repos.currentRepo;
    if (!repo) {
      this.clearEditorDecorations(editor);
      return;
    }
    const fsPath = editor.document.uri.fsPath;
    if (!isUnderRepo(repo.root, fsPath)) {
      this.clearEditorDecorations(editor);
      return;
    }

    try {
      const versionKey = String(editor.document.version);
      const rows = await this.cache.get(repo, fsPath, versionKey);
      if (seq !== this.decorationSeq) return;
      if (vscode.window.activeTextEditor !== editor) return;

      const byLine = new Map<number, BlameLine>();
      for (const r of rows) {
        byLine.set(r.lineNumber, r);
      }

      const heatmap = vscode.workspace
        .getConfiguration("gitspecs.blame")
        .get<boolean>("heatmap", false);

      const annotations: vscode.DecorationOptions[] = [];
      const heatRanges: vscode.Range[][] = Array.from(
        { length: HEATMAP_BUCKET_COUNT },
        () => [],
      );
      const gutterRanges: vscode.Range[][] = Array.from(
        { length: HEATMAP_BUCKET_COUNT },
        () => [],
      );

      const rules = readAutolinkRules();
      const enrichedBySha = new Map<string, string>();
      const uniqueSummaries = new Map<string, string>();
      for (const blame of byLine.values()) {
        if (blame.summary && !uniqueSummaries.has(blame.sha)) {
          uniqueSummaries.set(blame.sha, blame.summary);
        }
      }
      let n = 0;
      for (const [sha, summary] of uniqueSummaries) {
        if (n++ >= 8) break;
        try {
          const full = await enrichTextWithIssues(this.repos, summary, this.log);
          if (full !== summary) enrichedBySha.set(sha, full);
        } catch {
          // offline
        }
      }
      if (seq !== this.decorationSeq) return;

      const includeDetails = this.hoverDetailsEnabled("annotations");
      const includeChanges = this.hoverChangesEnabled("annotations");
      const actions = defaultBlameHoverActions();

      for (let i = 0; i < editor.document.lineCount; i++) {
        const lineNo = i + 1;
        const blame = byLine.get(lineNo);
        if (!blame) continue;
        const range = editor.document.lineAt(i).range;

        let hoverMessage: vscode.MarkdownString | undefined;
        if (includeDetails || includeChanges) {
          const text = formatCombinedBlameHoverMarkdown(blame, {
            includeDetails,
            includeChanges,
            previousLine: undefined,
            previousSha: blame.previousSha,
            autolinkRules: rules,
            enrichedBlock: enrichedBySha.get(blame.sha),
            actions,
          });
          hoverMessage = new vscode.MarkdownString(text, true);
          hoverMessage.isTrusted = true;
        }

        annotations.push({
          range,
          renderOptions: {
            after: {
              contentText: formatLineBlame(blame),
            },
          },
          hoverMessage,
        });

        const bucket = heatmapBucketIndex(blame.authorTime ?? 0);
        gutterRanges[bucket]!.push(range);
        if (heatmap) {
          heatRanges[bucket]!.push(range);
        }
      }

      editor.setDecorations(this.decorationType, annotations);
      for (let b = 0; b < HEATMAP_BUCKET_COUNT; b++) {
        editor.setDecorations(this.gutterTypes[b]!, gutterRanges[b]!);
        editor.setDecorations(
          this.heatmapTypes[b]!,
          heatmap ? heatRanges[b]! : [],
        );
      }
    } catch (err) {
      if (seq !== this.decorationSeq) return;
      this.log.debug(`blame refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      this.clearEditorDecorations(editor);
    }
  }

  private clearEditorDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.decorationType, []);
    for (const t of this.heatmapTypes) {
      editor.setDecorations(t, []);
    }
    for (const t of this.gutterTypes) {
      editor.setDecorations(t, []);
    }
  }

  private clearAllFileBlame(): void {
    for (const ed of vscode.window.visibleTextEditors) {
      this.clearEditorDecorations(ed);
    }
  }

  dispose(): void {
    if (this.decorationTimer) clearTimeout(this.decorationTimer);
    if (this.statusBarTimer) clearTimeout(this.statusBarTimer);
    if (this.currentLineTimer) clearTimeout(this.currentLineTimer);
    this.clearAllFileBlame();
    for (const ed of vscode.window.visibleTextEditors) {
      ed.setDecorations(this.currentLineType, []);
    }
    this.cache.clear();
    this.statusBar.hide();
    for (const d of this.disposables) d.dispose();
  }
}
