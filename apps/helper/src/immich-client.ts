import { request } from 'undici';

export type ImmichAsset = {
  id: string;
  type: string;
  originalFileName: string;
  duration?: string;
};

export type ImmichOriginalDownload = {
  stream: NodeJS.ReadableStream;
  sizeBytes?: number;
};

export class ImmichClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async getAsset(assetId: string): Promise<ImmichAsset> {
    const encodedAssetId = encodeURIComponent(assetId);
    const response = await request(`${this.baseUrl}/api/assets/${encodedAssetId}`, {
      method: 'GET',
      headers: { 'X-API-Key': this.apiKey },
    });

    if (response.statusCode !== 200) {
      await response.body.dump();
      throw new Error(`Immich asset lookup failed with status ${response.statusCode}`);
    }

    return response.body.json() as Promise<ImmichAsset>;
  }

  async downloadOriginal(assetId: string): Promise<ImmichOriginalDownload> {
    const encodedAssetId = encodeURIComponent(assetId);
    const response = await request(`${this.baseUrl}/api/assets/${encodedAssetId}/original`, {
      method: 'GET',
      headers: { 'X-API-Key': this.apiKey },
    });

    if (response.statusCode !== 200) {
      await response.body.dump();
      throw new Error(`Immich original download failed with status ${response.statusCode}`);
    }

    const contentLength = response.headers['content-length'];
    const parsedSizeBytes = typeof contentLength === 'string' ? Number.parseInt(contentLength, 10) : Number.NaN;

    return {
      stream: response.body,
      sizeBytes: Number.isFinite(parsedSizeBytes) && parsedSizeBytes > 0 ? parsedSizeBytes : undefined,
    };
  }
}
