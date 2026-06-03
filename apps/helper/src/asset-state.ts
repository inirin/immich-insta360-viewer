export type AssetStatusName =
  | 'unknown'
  | 'downloading'
  | 'analyzing'
  | 'processing'
  | 'playable'
  | 'ready'
  | 'failed';

export type AssetStatus = {
  state: AssetStatusName;
  progress: number | null;
  message: string;
  error?: string;
};

export class AssetStateStore {
  private readonly states = new Map<string, AssetStatus>();

  get(assetId: string): AssetStatus {
    return this.states.get(assetId) ?? {
      state: 'unknown',
      progress: null,
      message: 'Asset has not been prepared',
    };
  }

  set(assetId: string, status: AssetStatus): void {
    this.states.set(assetId, status);
  }
}
