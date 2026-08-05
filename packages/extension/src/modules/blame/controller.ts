import * as vscode from "vscode";
import * as path from "node:path";
import type { BlameLine } from "@gitspecs/git-core";
import type { RepoContext } from "../../shell/repoContext.js";
import type { PlatformLog } from "../../shell/log.js";
import { presentError } from "../../shell/errors.js";
import { formatLineBlame, formatBlameHover } from "./format.js";

export class BlameController implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private enabled = false;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshTimer: NodeJS.Timeout | undefined;

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

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (this.enabled) void this.refreshActiveEditor();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.enabled) return;
        const ed = vscode.window.activeTextEditor;
        if (ed && e.document === ed.document) {
          this.scheduleRefresh();
        }
      }),
    );
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  async toggle(): Promise<void> {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.clearAll();
      void vscode.window.setStatusBarMessage("GitSpecs: File blame off", 2000);
      return;
    }
    void vscode.window.setStatusBarMessage("GitSpecs: File blame on", 2000);
    await this.refreshActiveEditor();
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
    if (editor.document.isUntitled || editor.document.uri.scheme !== "file") {
      void vscode.window.showInformationMessage("Blame requires a saved file on disk");
      return;
    }
    const lineNumber = editor.selection.active.line + 1;
    try {
      const line = await repo.blame.blameLine(file, lineNumber);
      if (!line) {
        void vscode.window.showInformationMessage("No blame information for this line");
        return;
      }
      const msg = formatLineBlame(line);
      const open = "Copy SHA";
      const pick = await vscode.window.showInformationMessage(msg, open);
      if (pick === open) {
        await vscode.env.clipboard.writeText(line.sha);
      }
    } catch (err) {
      await presentError(this.log, err, "Blame line");
    }
  }

  async blameFileToOutput(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
      void vscode.window.showInformationMessage("Open a file on disk to blame");
      return;
    }
    const repo = this.repos.currentRepo;
    if (!repo) {
      void vscode.window.showInformationMessage("No Git repository selected");
      return;
    }
    try {
      const rows = await repo.blame.blame({ file: editor.document.uri.fsPath });
      this.log.info(`Blame ${path.basename(editor.document.uri.fsPath)} (${rows.length} lines)`);
      for (const row of rows) {
        this.log.info(`L${row.lineNumber}\t${formatLineBlame(row)}`);
      }
      this.log.show();
    } catch (err) {
      await presentError(this.log, err, "Blame file");
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      void this.refreshActiveEditor();
    }, 400);
  }

  private async refreshActiveEditor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.enabled) return;
    if (editor.document.uri.scheme !== "file" || editor.document.isUntitled) {
      editor.setDecorations(this.decorationType, []);
      return;
    }
    const repo = this.repos.currentRepo;
    if (!repo) {
      editor.setDecorations(this.decorationType, []);
      return;
    }
    // Ensure file is under current repo
    const fsPath = editor.document.uri.fsPath;
    if (!fsPath.startsWith(repo.root)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    try {
      const rows = await repo.blame.blame({ file: fsPath });
      const byLine = new Map<number, BlameLine>();
      for (const r of rows) {
        byLine.set(r.lineNumber, r);
      }

      const decorations: vscode.DecorationOptions[] = [];
      // Annotate each non-empty line once at end of line
      for (let i = 0; i < editor.document.lineCount; i++) {
        const lineNo = i + 1;
        const blame = byLine.get(lineNo);
        if (!blame) continue;
        const range = editor.document.lineAt(i).range;
        decorations.push({
          range,
          renderOptions: {
            after: {
              contentText: formatLineBlame(blame),
            },
          },
          hoverMessage: new vscode.MarkdownString(formatBlameHover(blame)),
        });
      }
      editor.setDecorations(this.decorationType, decorations);
    } catch (err) {
      this.log.debug(`blame refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      editor.setDecorations(this.decorationType, []);
    }
  }

  private clearAll(): void {
    for (const ed of vscode.window.visibleTextEditors) {
      ed.setDecorations(this.decorationType, []);
    }
  }

  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.clearAll();
    for (const d of this.disposables) d.dispose();
  }
}
