import { request } from 'undici';

export type ImmichAsset = {
  id: string;
  type: string;
  originalFileName: string;
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

  async downloadOriginal(assetId: string): Promise<NodeJS.ReadableStream> {
    const encodedAssetId = encodeURIComponent(assetId);
    const response = await request(`${this.baseUrl}/api/assets/${encodedAssetId}/original`, {
      method: 'GET',
      headers: { 'X-API-Key': this.apiKey },
    });

    if (response.statusCode !== 200) {
      await response.body.dump();
      throw new Error(`Immich original download failed with status ${response.statusCode}`);
    }

    return response.body;
  }
}
