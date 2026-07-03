/**
 * Simple CSV parser for SP-API report data
 * Handles tab-delimited and comma-delimited formats
 */

export interface CSVParseOptions {
  delimiter?: string;
  hasHeader?: boolean;
  trimValues?: boolean;
}

export function parseCSV<T = Record<string, string>>(
  csvData: string,
  options: CSVParseOptions = {}
): T[] {
  const { delimiter = '\t', hasHeader = true, trimValues = true } = options;

  const lines = csvData.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headerLine = hasHeader ? lines[0] : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // Parse header
  const headers = headerLine
    ? parseCSVLine(headerLine, delimiter).map((h) => normalizeHeader(h))
    : [];

  // Parse data rows
  const results: T[] = [];

  for (const line of dataLines) {
    const values = parseCSVLine(line, delimiter);

    if (values.length === 0) {
      continue;
    }

    const row: Record<string, string> = {};

    if (hasHeader && headers.length > 0) {
      headers.forEach((header, index) => {
        let value = values[index] || '';
        if (trimValues) {
          value = value.trim();
        }
        row[header] = value;
      });
    } else {
      // No header - use numeric indices
      values.forEach((value, index) => {
        row[`col_${index}`] = trimValues ? value.trim() : value;
      });
    }

    results.push(row as T);
  }

  return results;
}

/**
 * Parse a single CSV line, handling quoted values
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else if (char === '"') {
        // End of quoted value
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted value
        inQuotes = true;
      } else if (char === delimiter) {
        // End of field
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  // Push the last value
  values.push(current);

  return values;
}

/**
 * Normalize header names to be valid JavaScript identifiers
 */
function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Convert CSV row values to appropriate types
 */
export function parseCSVRow<T>(
  row: Record<string, string>,
  schema: Record<keyof T, 'string' | 'number' | 'boolean' | 'date'>
): T {
  const result: Record<string, unknown> = {};

  for (const [key, type] of Object.entries(schema)) {
    const value = row[key];

    if (value === undefined || value === '') {
      result[key] = null;
      continue;
    }

    switch (type) {
      case 'number':
        result[key] = parseFloat(value) || 0;
        break;
      case 'boolean':
        result[key] = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
        break;
      case 'date':
        result[key] = new Date(value);
        break;
      default:
        result[key] = value;
    }
  }

  return result as T;
}
