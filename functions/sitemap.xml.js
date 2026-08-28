/**
 * Cloudflare Pages Function — 動的 sitemap.xml
 * GAS の ?sitemap=1 エンドポイントをプロキシして XML を返す
 * edge cache 1h で GAS 負荷軽減
 */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxLMJF5LcekgykRj2020apkN4x3dyj6x4xg58YLsYOqi0AhLzU1Eza1kh5z-kqExDNY/exec';

export async function onRequest(context) {
  try {
    const upstream = await fetch(GAS_URL + '?sitemap=1', {
      redirect: 'follow',
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    const xml = await upstream.text();
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=3600'
      }
    });
  } catch (err) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n', {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8' }
    });
  }
}
