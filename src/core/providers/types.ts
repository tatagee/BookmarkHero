export interface ClassificationResult {
  /** keep = 当前位置合理, move = 建议移动到新位置 */
  action: 'keep' | 'move';
  suggestedFolderId: string;
  suggestedFolderPath: string;
  confidence: number;
  reasoning: string;
  alternativeFolders?: {
    folderId: string;
    folderPath: string;
    confidence: number;
  }[];
}

export interface ClassifyOptions {
  mode: 'quick' | 'deep';
  strictFoldersOnly?: boolean;
}

export interface IAIProvider {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  classify(
    bookmark: { title: string; url: string; currentPath?: string },
    existingFolders: { id: string; path: string }[],
    options?: ClassifyOptions
  ): Promise<ClassificationResult>;
  classifyBatch(
    bookmarks: { id: string; title: string; url: string; currentPath?: string }[],
    existingFolders: { id: string; path: string }[],
    options?: ClassifyOptions
  ): Promise<Map<string, ClassificationResult>>;
  groupDuplicateFolders?(
    folderNames: string[],
    language?: string
  ): Promise<string[][]>;
  generateTaxonomy?(
    bookmarksSubSample: { title: string; url: string }[],
    maxCategories: number,
    language?: string,
    existingFolders?: string[]
  ): Promise<string[]>;
}
