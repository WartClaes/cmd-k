export interface SearchResult {
  label: string;
  subtitle?: string;
  icon?: string;
  resultId?: string;
  execute: () => void | Promise<void>;
}

export interface SearchProvider {
  key: string;
  label: string;
  icon?: string;
  search: (query: string) => Promise<SearchResult[]>;
  resolve?: (resultId: string) => Promise<SearchResult | null>;
}
