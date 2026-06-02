import { Deck } from '../store/useAppStore';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { decompress } from 'fzstd';

export const uploadAndParseApkg = async (file: File): Promise<Deck> => {
  // Load and unzip the apkg file
  const zip = await JSZip.loadAsync(file);
  
  let dbData: Uint8Array | null = null;
  
  // Try collection.anki21b (zstd), then collection.anki21, then collection.anki2
  if (zip.file('collection.anki21b')) {
    const rawData = await zip.file('collection.anki21b')!.async('uint8array');
    dbData = decompress(rawData);
  } else if (zip.file('collection.anki21')) {
    dbData = await zip.file('collection.anki21')!.async('uint8array');
  } else if (zip.file('collection.anki2')) {
    dbData = await zip.file('collection.anki2')!.async('uint8array');
  } else {
    throw new Error('No collection database found in apkg');
  }

  // Initialize sql.js
  const SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl
  });

  // Open the database
  const db = new SQL.Database(dbData);
  
  // Extract words
  // First, query the notes table
  const results = db.exec('SELECT sfld, flds FROM notes');
  
  db.close();

  const words: string[] = [];
  const seen = new Set<string>();

  if (results.length > 0 && results[0].values) {
    for (const record of results[0].values) {
      const sfld = record[0] as string | null;
      const flds = record[1] as string | null;
      
      let w = (sfld || '').trim();
      if (!w && flds) {
        w = flds.split('\x1f')[0].trim();
      }
      
      // Remove HTML tags for clean words
      w = w.replace(/<[^>]*>?/gm, '').trim();

      if (w && !seen.has(w)) {
        seen.add(w);
        words.push(w);
      }
    }
  }

  return {
    id: `deck_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: file.name.replace(/\.apkg$/i, ''),
    words,
    createdAt: Date.now()
  };
};
