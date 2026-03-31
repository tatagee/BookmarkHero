export interface ClassificationResult {
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

export interface IAIProvider {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  classify(
    bookmark: { title: string; url: string },
    existingFolders: { id: string; path: string }[]
  ): Promise<ClassificationResult>;
  classifyBatch(
    bookmarks: { id: string; title: string; url: string }[],
    existingFolders: { id: string; path: string }[]
  ): Promise<Map<string, ClassificationResult>>;
}
