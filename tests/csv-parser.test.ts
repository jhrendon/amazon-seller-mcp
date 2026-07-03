import { parseCSV, parseCSVRow } from '../src/utils/csv-parser.js';

describe('parseCSV', () => {
  it('parses tab-delimited data with a header and trims values', () => {
    const csv = 'name\tage\tcity\nAlice\t30\tNY\nBob\t 25 \tLA\n';
    const result = parseCSV(csv);

    expect(result).toEqual([
      { name: 'Alice', age: '30', city: 'NY' },
      { name: 'Bob', age: '25', city: 'LA' },
    ]);
  });

  it('parses comma-delimited data with quoted values containing the delimiter', () => {
    const csv = 'sku,description,price\nABC,"a, b, c",10\nDEF,"hello ""world""",20\n';
    const result = parseCSV(csv, { delimiter: ',' });

    expect(result).toEqual([
      { sku: 'ABC', description: 'a, b, c', price: '10' },
      { sku: 'DEF', description: 'hello "world"', price: '20' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('   \n   \n')).toEqual([]);
  });

  it('normalizes headers to lowercase snake_case', () => {
    const csv = 'Product Name\tFNSKU\nFoo\tX1\n';
    const result = parseCSV(csv);

    expect(result).toEqual([{ product_name: 'Foo', fnsku: 'X1' }]);
  });

  it('parses rows without a header using numeric column keys', () => {
    const csv = 'a\tb\tc\n';
    const result = parseCSV(csv, { hasHeader: false });

    expect(result).toEqual([{ col_0: 'a', col_1: 'b', col_2: 'c' }]);
  });
});

describe('parseCSVRow', () => {
  it('coerces string values to number, boolean, and date types per schema', () => {
    const row = { qty: '42', active: 'true', when: '2025-01-15' };
    const result = parseCSVRow<{ qty: number; active: boolean; when: Date | null }>(row, {
      qty: 'number',
      active: 'boolean',
      when: 'date',
    });

    expect(result.qty).toBe(42);
    expect(result.active).toBe(true);
    expect(result.when).toBeInstanceOf(Date);
    expect((result.when as Date).getUTCFullYear()).toBe(2025);
  });

  it('returns null for empty or missing values', () => {
    const result = parseCSVRow<{ a: number | null; b: string | null }>(
      { a: '', b: '' },
      { a: 'number', b: 'string' }
    );
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
  });

  it('treats 1, true, and yes as truthy booleans', () => {
    const result = parseCSVRow<{ a: boolean; b: boolean; c: boolean }>(
      { a: '1', b: 'yes', c: 'false' },
      { a: 'boolean', b: 'boolean', c: 'boolean' }
    );
    expect(result.a).toBe(true);
    expect(result.b).toBe(true);
    expect(result.c).toBe(false);
  });
});
