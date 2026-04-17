import * as XLSX from 'xlsx';

interface ExportOptions {
    headers: string[];
    rows: (string | number | null | undefined)[][];
    fileName: string;
    sheetName?: string;
}

export function exportToExcel({ headers, rows, fileName, sheetName = "Données" }: ExportOptions) {
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Auto-size columns based on content
    const colWidths = headers.map((h, i) => {
        const maxLen = Math.max(
            h.length,
            ...rows.map(r => String(r[i] ?? '').length)
        );
        return { wch: Math.min(maxLen + 4, 40) };
    });
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${fileName}.xlsx`);
}
