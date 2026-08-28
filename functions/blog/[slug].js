/**
 * Cloudflare Pages Function — ブログ詳細 SSR
 * /blog/{slug}/ を受け、GAS から記事を取得して完全な HTML を返す
 * initial HTML に本文＋BlogPosting JSON-LD を含めるので Googlebot が即座に読める
 */
const GAS_URL   = 'https://script.google.com/macros/s/AKfycbxLMJF5LcekgykRj2020apkN4x3dyj6x4xg58YLsYOqi0AhLzU1Eza1kh5z-kqExDNY/exec';
const SITE_URL  = 'https://sumai-doctor-smile.search-mania.net';
const STORE     = '株式会社住まいドクタースマイル';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s);
}
function driveImg(url) {
  if (!url) return '';
  const s = String(url).trim();
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return 'https://drive.google.com/thumbnail?id=' + m1[1] + '&sz=w1200';
  const m2 = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (m2) return 'https://lh3.googleusercontent.com/d/' + m2[1] + '=w1200';
  return s;
}

function findBySlug(items, slug) {
  if (!Array.isArray(items) || !slug) return null;
  // 1. URL に /blog/SLUG を含む記事
  let hit = items.find(b => b && b.url && (
    b.url.indexOf('/blog/' + slug + '/') !== -1 ||
    b.url.indexOf('/blog/' + slug) !== -1
  ));
  if (hit) return hit;
  // 2. URL がスラッグで始まる
  hit = items.find(b => b && b.url && (
    b.url === slug || b.url === (slug + '/') ||
    b.url.indexOf(slug + '-') === 0 || b.url.indexOf(slug + '/') === 0
  ));
  if (hit) return hit;
  // 3. 日付完全一致
  return items.find(b => b && b.date === slug) || null;
}

function notFound() {
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<title>記事が見つかりません | ${STORE}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${SITE_URL}/">
<style>body{font-family:sans-serif;text-align:center;padding:80px 20px;background:#FFF9F0;color:#0F2560}
a{color:#FF7A0F;text-decoration:none;display:inline-block;margin-top:20px;padding:12px 32px;border:2px solid #FF7A0F;border-radius:999px}</style>
</head><body><h1>記事が見つかりません</h1><p>指定された記事は削除されたか、URLが正しくない可能性があります。</p>
<a href="${SITE_URL}/">← トップへ戻る</a></body></html>`;
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function onRequest(context) {
  const { params } = context;
  const slug = String(params.slug || '').replace(/\/$/, '');
  if (!slug) return notFound();

  let item = null;
  try {
    const resp = await fetch(GAS_URL + '?blog_all=1', {
      redirect: 'follow',
      cf: { cacheTtl: 900, cacheEverything: true }
    });
    const data = await resp.json();
    item = findBySlug(data.blog, slug);
  } catch (err) {
    return notFound();
  }
  if (!item) return notFound();

  const imgUrl = driveImg(item.image);
  let title = (item.title || '').trim();
  if (!title && item.body) title = String(item.body).split(/[。\n]/)[0].trim();
  if (!title && item.date) title = `${fmtDate(item.date)} の投稿`;
  const desc = (item.body || title).replace(/\s+/g, ' ').trim().slice(0, 120);
  const canonical = `${SITE_URL}/blog/${slug}/`;
  const datePub = item.date || '';

  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    'headline': title,
    'description': desc,
    'datePublished': datePub,
    'image': imgUrl || `${SITE_URL}/ogp.svg`,
    'url': canonical,
    'inLanguage': 'ja',
    'publisher': { '@type': 'Organization', 'name': STORE, 'url': SITE_URL }
  });

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${STORE}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/png" href="/logo.png">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${esc(imgUrl || SITE_URL + '/ogp.svg')}">
<meta property="og:site_name" content="${STORE}">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(imgUrl || SITE_URL + '/ogp.svg')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${jsonld}</script>
<style>
:root { --navy:#0F2560; --accent:#FF7A0F; --ink:#0F1E3F; --ink-soft:#3A4A66; --bg:#FFF9F0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Noto Sans JP', sans-serif; color: var(--ink); background: var(--bg); line-height: 1.85; }
.blog-header { background: linear-gradient(135deg, #0F2560 0%, #1F52B0 100%); color: #fff; padding: 22px 24px; text-align: center; box-shadow: 0 2px 12px rgba(15,37,96,.2); }
.blog-header a { color: #fff; text-decoration: none; font-weight: 700; letter-spacing: .06em; }
.blog-wrap { max-width: 780px; margin: 40px auto; padding: 0 20px; }
.blog-card { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 12px 40px -18px rgba(15,37,96,.25); }
.blog-card img { width: 100%; height: auto; display: block; }
.blog-body { padding: 32px 28px 36px; }
.blog-date { display: inline-block; font-family: 'Outfit', sans-serif; font-size: 13px; color: var(--accent); letter-spacing: .12em; margin-bottom: 12px; font-weight: 700; }
.blog-text { font-size: 15px; line-height: 2; color: var(--ink); white-space: pre-wrap; word-break: break-word; }
.back-wrap { text-align: center; margin-top: 32px; }
.back-btn { display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #FF4E70, #FF7A0F, #FFBD3A); color: #fff; text-decoration: none; border-radius: 999px; font-weight: 700; letter-spacing: .08em; box-shadow: 0 6px 20px rgba(255,122,15,.4); transition: transform .3s, box-shadow .3s; }
.back-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(255,122,15,.55); }
.produced-by { text-align: center; margin: 40px 0 20px; font-size: 11px; color: rgba(15,37,96,.4); letter-spacing: .18em; }
.produced-by a { color: rgba(15,37,96,.6); text-decoration: none; }
@media (max-width: 600px) { .blog-body { padding: 24px 20px 28px; } .blog-text { font-size: 14px; } }
</style>
</head>
<body>
<header class="blog-header">
  <a href="${SITE_URL}/">${STORE}</a>
</header>
<main class="blog-wrap">
  <article class="blog-card">
    ${imgUrl ? `<img src="${esc(imgUrl)}" alt="${esc(title)}" loading="eager">` : ''}
    <div class="blog-body">
      ${datePub ? `<span class="blog-date">${esc(fmtDate(datePub))}</span>` : ''}
      <div class="blog-text">${esc(item.body || '')}</div>
    </div>
  </article>
  <div class="back-wrap"><a class="back-btn" href="${SITE_URL}/">← トップへ戻る</a></div>
  <p class="produced-by">Produced by <a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania Inc.</a></p>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=900'
    }
  });
}
