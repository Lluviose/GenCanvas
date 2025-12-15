export interface ImagePolicy {
  enableWebp: boolean;
  webpQuality: number;
  maxDimension: number;
  maxImageMB: number;
  maxTotalMB: number;
  maxImages: number;
}

export interface Base64Image {
  mimeType: string;
  data: string;
}
