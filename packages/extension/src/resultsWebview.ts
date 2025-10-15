import * as vscode from 'vscode';
import { QueryResult } from './mcpClient';

/**
 * Webview for displaying query results
 */
export class ResultsWebview {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;
  private outputChannel: vscode.OutputChannel;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.context = context;
    this.outputChannel = outputChannel;
  }

  /**
   * Show query results in webview
   */
  show(result: QueryResult): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'bctbResults',
        'Telemetry Results',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.webview.html = this.getHtmlContent(result);
    this.outputChannel.appendLine('Results displayed in webview');
  }

  /**
   * Generate HTML content for webview
   */
  private getHtmlContent(result: QueryResult): string {
    if (result.type === 'error') {
      return this.getErrorHtml(result);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Telemetry Results</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }
    
    h1 {
      color: var(--vscode-editor-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    
    h2 {
      color: var(--vscode-editor-foreground);
      margin-top: 30px;
      margin-bottom: 15px;
    }
    
    .summary {
      background-color: var(--vscode-textBlockQuote-background);
      border-left: 4px solid var(--vscode-textBlockQuote-border);
      padding: 15px;
      margin-bottom: 20px;
      border-radius: 3px;
    }
    
    .kql-block {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 15px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
      margin-bottom: 20px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 13px;
    }
    
    th {
      background-color: var(--vscode-editorGroupHeader-tabsBackground);
      color: var(--vscode-editor-foreground);
      padding: 10px;
      text-align: left;
      border: 1px solid var(--vscode-panel-border);
      font-weight: 600;
      cursor: pointer;
      user-select: none;
    }
    
    th:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    
    td {
      padding: 8px 10px;
      border: 1px solid var(--vscode-panel-border);
    }
    
    tr:nth-child(even) {
      background-color: var(--vscode-list-inactiveSelectionBackground);
    }
    
    tr:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    
    .recommendations {
      background-color: var(--vscode-inputValidation-infoBackground);
      border-left: 4px solid var(--vscode-inputValidation-infoBorder);
      padding: 15px;
      margin-top: 20px;
      border-radius: 3px;
    }
    
    .recommendations ul {
      margin: 10px 0 0 0;
      padding-left: 20px;
    }
    
    .recommendations li {
      margin: 8px 0;
    }
    
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 10px;
    }
    
    .badge-cached {
      background-color: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-inputValidation-warningForeground);
    }
    
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--vscode-descriptionForeground);
    }
    
    .row-count {
      color: var(--vscode-descriptionForeground);
      font-size: 13px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <h1>
    Telemetry Results
    ${result.cached ? '<span class="badge badge-cached">CACHED</span>' : ''}
  </h1>
  
  <div class="summary">
    <strong>Summary:</strong> ${this.escapeHtml(result.summary)}
  </div>
  
  <h2>KQL Query</h2>
  <div class="kql-block">${this.escapeHtml(result.kql)}</div>
  
  ${this.renderTable(result)}
  
  ${this.renderRecommendations(result)}
</body>
</html>`;
  }

  /**
   * Render table
   */
  private renderTable(result: QueryResult): string {
    if (!result.columns || !result.rows || result.rows.length === 0) {
      return '<div class="empty-state">No results returned</div>';
    }

    const rowCount = result.rows.length;
    const columnCount = result.columns.length;

    let html = `<h2>Results</h2>`;
    html += `<div class="row-count">${rowCount} row(s) × ${columnCount} column(s)</div>`;
    html += '<table>';

    // Header
    html += '<thead><tr>';
    for (const column of result.columns) {
      html += `<th>${this.escapeHtml(column)}</th>`;
    }
    html += '</tr></thead>';

    // Rows (limit to first 1000 for performance)
    html += '<tbody>';
    const maxRows = Math.min(result.rows.length, 1000);

    for (let i = 0; i < maxRows; i++) {
      html += '<tr>';
      const row = result.rows[i];

      for (const cell of row) {
        html += `<td>${this.escapeHtml(this.formatCell(cell))}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
    html += '</table>';

    if (result.rows.length > 1000) {
      html += `<div class="row-count">Showing first 1000 of ${result.rows.length} rows</div>`;
    }

    return html;
  }

  /**
   * Render recommendations
   */
  private renderRecommendations(result: QueryResult): string {
    if (!result.recommendations || result.recommendations.length === 0) {
      return '';
    }

    let html = '<div class="recommendations">';
    html += '<h2>💡 Recommendations</h2>';
    html += '<ul>';

    for (const rec of result.recommendations) {
      html += `<li>${this.escapeHtml(rec)}</li>`;
    }

    html += '</ul>';
    html += '</div>';

    return html;
  }

  /**
   * Get error HTML
   */
  private getErrorHtml(result: QueryResult): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Query Error</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      padding: 20px;
      line-height: 1.6;
    }
    
    .error-container {
      background-color: var(--vscode-inputValidation-errorBackground);
      border-left: 4px solid var(--vscode-inputValidation-errorBorder);
      padding: 20px;
      border-radius: 3px;
      margin: 20px 0;
    }
    
    h1 {
      color: var(--vscode-errorForeground);
      margin-top: 0;
    }
    
    .error-message {
      font-size: 14px;
      margin: 15px 0;
    }
    
    .kql-block {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 15px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      overflow-x: auto;
      margin-top: 20px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>❌ Query Error</h1>
    <div class="error-message">${this.escapeHtml(result.summary)}</div>
    
    ${result.kql ? `
      <h2>Query</h2>
      <div class="kql-block">${this.escapeHtml(result.kql)}</div>
    ` : ''}
    
    ${result.recommendations && result.recommendations.length > 0 ? `
      <h2>Suggestions</h2>
      <ul>
        ${result.recommendations.map(r => `<li>${this.escapeHtml(r)}</li>`).join('')}
      </ul>
    ` : ''}
  </div>
</body>
</html>`;
  }

  /**
   * Format cell value
   */
  private formatCell(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Escape HTML
   */
  private escapeHtml(text: string | null | undefined): string {
    // Handle null/undefined values
    if (text === null || text === undefined) {
      return '';
    }

    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
}
