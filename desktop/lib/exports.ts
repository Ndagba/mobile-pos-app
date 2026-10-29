export interface ExportRow {
  [key: string]: string | number | null | undefined;
}

/**
 * Export tabular data to CSV.
 */
export function exportToCSV(
  filename: string,
  data: ExportRow[]
): void {
  if (!data || data.length === 0) {
    return;
  }

  const headers = Object.keys(data[0]);

  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  const csvRows = [
    headers.map(escapeCSV).join(','),
    ...data.map((row) =>
      headers.map((header) => escapeCSV(row[header])).join(',')
    ),
  ];

  const csvContent = csvRows.join('\n');

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export tabular data to a printable PDF.
 *
 * Uses the browser's native print dialog so the desktop PWA
 * does not require an additional PDF library.
 */
export function exportToPDF(
  filename: string,
  title: string,
  headers: string[],
  rows: string[][]
): void {
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    throw new Error(
      'Unable to open the PDF export window. Please allow pop-ups for this application.'
    );
  }

  const escapeHTML = (value: unknown): string => {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const headerHTML = headers
    .map((header) => `<th>${escapeHTML(header)}</th>`)
    .join('');

  const bodyHTML = rows
    .map(
      (row) => `
        <tr>
          ${row
            .map((cell) => `<td>${escapeHTML(cell)}</td>`)
            .join('')}
        </tr>
      `
    )
    .join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHTML(filename)}</title>

        <style>
          @page {
            size: A4;
            margin: 20mm;
          }

          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111;
            margin: 0;
          }

          h1 {
            font-size: 22px;
            margin-bottom: 6px;
          }

          .generated {
            color: #666;
            font-size: 12px;
            margin-bottom: 24px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }

          th,
          td {
            border: 1px solid #ccc;
            padding: 10px;
            text-align: left;
          }

          th {
            font-weight: bold;
            background: #f3f3f3;
          }

          td:last-child,
          th:last-child {
            text-align: right;
          }

          tr:last-child {
            font-weight: bold;
          }
        </style>
      </head>

      <body>
        <h1>${escapeHTML(title)}</h1>

        <div class="generated">
          Generated: ${escapeHTML(new Date().toLocaleString())}
        </div>

        <table>
          <thead>
            <tr>
              ${headerHTML}
            </tr>
          </thead>

          <tbody>
            ${bodyHTML}
          </tbody>
        </table>

        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
}