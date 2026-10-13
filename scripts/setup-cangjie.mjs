import { mkdir, rename } from 'node:fs/promises';
import { createWriteStream, createReadStream, existsSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../.local-tools/', import.meta.url));
await mkdir(directory, { recursive: true });
const assets = [
  {
    file: 'cangjie-sdk-windows-x64-1.0.5.zip',
    url: 'https://cangjie-lang.cn/v1/files/auth/downLoad?nsId=142267&fileName=cangjie-sdk-windows-x64-1.0.5.zip&objectKey=698acebfbd66ae22b62330af',
    sha256: '08c6c1dd0de73396f63ac85085d635e79ce84fef98d330cb00869b4fc8f1cb2e'
  },
  {
    file: 'cangjie-stdx-windows-x64-1.0.5.1.zip',
    url: 'https://gitcode.com/Cangjie/cangjie_stdx/releases/download/v1.0.5.1/cangjie-stdx-windows-x64-1.0.5.1.zip',
    // Pinned from the official HTTPS release fetched for T0; not a publisher-signed checksum.
    sha256: '8cd08133c4f1152acdcff00c923d9abe8184f081d6b92e924d2285f7e27f7162'
  }
];
for (const asset of assets) {
  const destination = `${directory}/${asset.file}`;
  const cached = existsSync(destination);
  const source = cached ? destination : `${destination}.partial`;
  if (!cached) {
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error(`Toolchain download failed: ${response.status}`);
    await pipeline(response.body, createWriteStream(source));
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(source)) hash.update(chunk);
  const actual = hash.digest('hex');
  if (actual !== asset.sha256) throw new Error(`Checksum mismatch for ${asset.file}: ${actual}`);
  if (!cached) await rename(source, destination);
  console.log(JSON.stringify({ file: destination, sha256: actual, verified: true }));
}
