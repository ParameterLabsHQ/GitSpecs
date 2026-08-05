import * as vscode from "vscode";
import * as path from "node:path";
import type { ChangedLineRange } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import type { AnnotationModeState } from "../../shell/annotationContext.js";

const REFRESH_DEBOUNCE_MS = 300;

function isDiskFile(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === "file" && !doc.isUntitled;
}

function isUnderRepo(repoRoot: string, fsPath: string): boolean {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(fsPath);
  return abs === root || abs.startsWith(root + path.sep);
}

/**
 * Toggleable gutter decorations for working-tree and unpushed line changes.
 */
export class ChangesAnnotationController implements vscode.Disposable {
  private readonly workingType: vscode.TextEditorDecorationType;
  private readonly unpushedType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];
  private enabled: boolean;
  private refreshTimer: NodeJS.Timeout | undefined;
  private seq = 0;

  constructor(
    private readonly repos: RepoContext,
    private readonly log: PlatformLog,
    private readonly annotationModes?: AnnotationModeState,
  ) {
    this.enabled = this.readSetting();
    void this.annotationModes?.setChanges(this.enabled);
    this.workingType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.addedForeground"),
      backgroundColor: new vscode.ThemeColor("diffEditor.insertedLineBackground"),
    });
    // Separate types so unpushed can use a distinct gutter color.
    this.unpushedType = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      overviewRulerLane: vscode.OverviewRulerLane.Center,
      overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.modifiedForeground"),
      borderWidth: "0 0 0 2px",
      borderStyle: "solid",
      borderColor: new vscode.ThemeColor("editorOverviewRuler.modifiedForeground"),
    });
    this.disposables.push(this.workingType, this.unpushedType);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("gitspecs.annotations.changes")) {
          this.enabled = this.readSetting();
          void this.annotationModes?.setChanges(this.enabled);
          void this.refreshAll();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.scheduleRefresh()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme === "file") this.scheduleRefresh();
      }),
      vscode.workspace.onDidSaveTextDocument(() => this.scheduleRefresh()),
      this.repos.onDidChange(() => void this.refreshAll()),
    );

    if (this.enabled) {
      void this.refreshAll();
    }
  }

  private readSetting(): boolean {
    return vscode.workspace
      .getConfiguration("gitspecs")
      .get<boolean>("annotations.changes", false);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    // Persist for the workspace so the toggle sticks across reloads of the session.
    await vscode.workspace
      .getConfiguration("gitspecs")
      .update("annotations.changes", this.enabled, vscode.ConfigurationTarget.Global);
    await this.annotationModes?.setChanges(this.enabled);
    void vscode.window.setStatusBarMessage(
      this.enabled
        ? "GitSpecs: changes annotations on"
        : "GitSpecs: changes annotations off",
      2500,
    );
    await this.refreshAll();
  }

  /** Turn off changes annotations (Escape dismiss / modes). */
  async dismiss(): Promise<void> {
    if (!this.enabled) {
      await this.annotationModes?.setChanges(false);
      return;
    }
    this.enabled = false;
    await vscode.workspace
      .getConfiguration("gitspecs")
      .update("annotations.changes", false, vscode.ConfigurationTarget.Global);
    await this.annotationModes?.setChanges(false);
    await this.refreshAll();
  }

  private scheduleRefresh(): void {
    if (!this.enabled) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refreshAll(), REFRESH_DEBOUNCE_MS);
  }

  private async refreshAll(): Promise<void> {
    const my = ++this.seq;
    const editors = vscode.window.visibleTextEditors.filter(
      (e) => isDiskFile(e.document),
    );
    if (!this.enabled) {
      for (const editor of editors) {
        editor.setDecorations(this.workingType, []);
        editor.setDecorations(this.unpushedType, []);
      }
      return;
    }

    for (const editor of editors) {
      if (my !== this.seq) return;
      await this.refreshEditor(editor);
    }
  }

  private async refreshEditor(editor: vscode.TextEditor): Promise<void> {
    const repo = this.repos.currentRepo;
    if (!repo || !isUnderRepo(repo.root, editor.document.uri.fsPath)) {
      editor.setDecorations(this.workingType, []);
      editor.setDecorations(this.unpushedType, []);
      return;
    }

    try {
      const ranges = await repo.changes.changedLines(editor.document.uri.fsPath);
      const working = ranges.filter((r) => r.kind === "working");
      const unpushed = ranges.filter((r) => r.kind === "unpushed");
      editor.setDecorations(this.workingType, toDecorationOptions(working, editor.document));
      editor.setDecorations(
        this.unpushedType,
        toDecorationOptions(unpushed, editor.document),
      );
      this.log.debug(
        `Changes annotations: ${editor.document.uri.fsPath} w=${working.length} u=${unpushed.length}`,
      );
    } catch (err) {
      this.log.debug(
        `Changes annotations failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      editor.setDecorations(this.workingType, []);
      editor.setDecorations(this.unpushedType, []);
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    for (const d of this.disposables) d.dispose();
  }
}

function toDecorationOptions(
  ranges: ChangedLineRange[],
  document: vscode.TextDocument,
): vscode.DecorationOptions[] {
  const out: vscode.DecorationOptions[] = [];
  const maxLine = document.lineCount;
  for (const r of ranges) {
    // Convert 1-based inclusive → 0-based vscode ranges.
    const start = Math.max(0, Math.min(maxLine - 1, r.startLine - 1));
    const end = Math.max(start, Math.min(maxLine - 1, r.endLine - 1));
    const startPos = new vscode.Position(start, 0);
    const endLine = document.lineAt(end);
    const endPos = endLine.range.end;
    out.push({
      range: new vscode.Range(startPos, endPos),
      hoverMessage:
        r.kind === "working"
          ? "GitSpecs: changed in working tree"
          : "GitSpecs: changed in unpushed commits",
    });
  }
  return out;
}
