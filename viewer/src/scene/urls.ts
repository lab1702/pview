export function resolveAtlasUrl(file: string, baseUrl: string): string {
  return file.startsWith('data:') ? file : baseUrl + file
}
