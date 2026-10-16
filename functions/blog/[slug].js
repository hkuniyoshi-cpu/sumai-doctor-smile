/* Cloudflare Pages Function: /blog/{slug}/
 * Server-Side Rendered ブログ詳細ページ（住まいドクタースマイル）— タイ古式RAKSAA と同方式
 *
 * 目的:
 *   - Googlebot が JS レンダリング待ちせずに完全な HTML を受け取れる → インデックス高速化
 *   - パス型 URL (/blog/{slug}/) で CTR 向上・エンティティ理解強化
 *   - JSON-LD BlogPosting 埋込で Rich Snippet 対応
 *   - 旧来の日付だけの URL (/blog/2026-10-12/) は正規 URL へ 301
 *
 * Cache: 15分
 */

const GAS_URL       = 'https://script.google.com/macros/s/AKfycbxLMJF5LcekgykRj2020apkN4x3dyj6x4xg58YLsYOqi0AhLzU1Eza1kh5z-kqExDNY/exec';
const SITE_URL      = 'https://sumai-doctor-smile.search-mania.net';
const STORE_NAME    = '株式会社住まいドクタースマイル';
const STORE_NAME_EN = 'Sumai Doctor Smile';
const TEL           = '098-987-5500';
const RECENT_COUNT  = 5;

export async function onRequest(context) {
  const slug = context.params.slug;
  if (!slug) {
    return Response.redirect(SITE_URL + '/#blog', 302);
  }

  try {
    const upstream = await fetch(GAS_URL + '?blog_all=1', {
      redirect: 'follow',
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    if (!upstream.ok) {
      return html(renderError('CMS upstream ' + upstream.status), 502);
    }
    const data = await upstream.json();
    const posts = ((data && data.blog) || []).filter(p => p && (p.body || p.title));

    const decoded = decodeURIComponent(slug);
    const post = findPost(posts, decoded);
    if (!post) {
      return html(renderNotFound(), 404);
    }

    // 旧URL（日付だけ）でアクセスされたら正規 URL へ寄せる
    const canonicalSlug = postSlug(post);
    if (canonicalSlug && canonicalSlug !== decoded) {
      return Response.redirect(SITE_URL + '/blog/' + encodeURIComponent(canonicalSlug) + '/', 301);
    }

    const recent = posts.filter(p => p !== post).slice(0, RECENT_COUNT);
    return html(renderPost(post, canonicalSlug || decoded, recent), 200, {
      'Cache-Control': 'public, max-age=900, s-maxage=900',
    });
  } catch (err) {
    return html(renderError(String(err && err.message || err)), 500);
  }
}

function html(body, status, extraHeaders) {
  const headers = Object.assign({
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  }, extraHeaders || {});
  return new Response(body, { status: status || 200, headers });
}

// F列 url の末尾セグメントを slug にする（"2026-10-16-0524/" / ".../blog/2026-07-13-1200/" 両対応）
function postSlug(p) {
  const u = String(p.url || '').trim();
  const m = u.match(/\/blog\/([^\/\?#]+)/);
  if (m) return m[1];
  const m2 = u.replace(/\/+$/, '').match(/^([^\/\?#:]+)$/);
  if (m2) return m2[1];
  return p.date || '';
}

function findPost(posts, slug) {
  for (const p of posts) {
    if (postSlug(p) === slug) return p;
  }
  // 旧URL互換：日付だけの slug は同日の最新記事へ
  for (const p of posts) {
    if (p.date === slug) return p;
  }
  return null;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s);
}

function extractTitle(post) {
  if (post.title && String(post.title).trim()) return String(post.title).trim();
  if (post.body) {
    const firstLine = String(post.body).split(/[。\n]/)[0].trim();
    if (firstLine) return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine;
  }
  if (post.date) return `${fmtDate(post.date)} の投稿`;
  return 'お知らせ';
}

// タイトルに使った1行目は本文から外す（H1 と本文先頭の重複を避ける）
function bodyWithoutTitle(post, title) {
  const body = String(post.body || '');
  if (post.title && String(post.title).trim()) return body;
  const lines = body.split('\n');
  if (lines[0] && lines[0].trim() === title) {
    return lines.slice(1).join('\n').replace(/^\s+/, '');
  }
  return body;
}

function toImageUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  const m1 = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return `https://drive.google.com/thumbnail?id=${m1[1]}&sz=w1200`;
  const m2 = s.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (m2) return `https://lh3.googleusercontent.com/d/${m2[1]}=w1200`;
  if (s.indexOf('drive.google.com/thumbnail') !== -1) {
    return s.replace(/([?&])sz=[^&]*/, '$1sz=w1200');
  }
  return s;
}

function renderPost(post, slug, recent) {
  const title = extractTitle(post);
  const bodyText = bodyWithoutTitle(post, title);
  const desc = (String(post.body || '') || title).replace(/\s+/g, ' ').slice(0, 160);
  const imgUrl = toImageUrl(post.image);
  const date = post.date || '';
  const dateFmt = fmtDate(date);
  const canonical = SITE_URL + '/blog/' + encodeURIComponent(slug) + '/';
  const ogImage = imgUrl || SITE_URL + '/ogp.svg';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    'headline': title,
    'description': desc,
    'datePublished': date,
    'inLanguage': 'ja',
    'url': canonical,
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonical },
    'image': ogImage,
    'publisher': {
      '@type': 'Organization',
      'name': STORE_NAME,
      'alternateName': STORE_NAME_EN,
      'url': SITE_URL,
      'logo': { '@type': 'ImageObject', 'url': SITE_URL + '/logo.png' }
    },
    'author': {
      '@type': 'Organization', 'name': STORE_NAME, 'url': SITE_URL
    }
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': [
      { '@type': 'ListItem', 'position': 1, 'name': 'トップ', 'item': SITE_URL + '/' },
      { '@type': 'ListItem', 'position': 2, 'name': 'お知らせ・ブログ', 'item': SITE_URL + '/#blog' },
      { '@type': 'ListItem', 'position': 3, 'name': title, 'item': canonical }
    ]
  };

  const recentHtml = recent.map(p => {
    const s = postSlug(p);
    if (!s) return '';
    return `<li><a href="/blog/${esc(encodeURIComponent(s))}/"><span class="r-date">${esc(fmtDate(p.date))}</span><span class="r-title">${esc(extractTitle(p))}</span></a></li>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0F2560">
<meta http-equiv="content-language" content="ja">

<title>${esc(title)} | ${esc(STORE_NAME)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(STORE_NAME)}">
<meta property="og:locale" content="ja_JP">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(ogImage)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(ogImage)}">

<link rel="icon" type="image/png" href="/logo.png">
<link rel="apple-touch-icon" href="/logo.png">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">

<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:linear-gradient(180deg,#FFF9F0 0%,#FFEDD5 100%);color:#0F1E3F;font-family:'Noto Sans JP',sans-serif;line-height:1.85;-webkit-font-smoothing:antialiased;min-height:100vh}
header{background:linear-gradient(135deg,#0F2560 0%,#1F52B0 100%);padding:12px 20px;position:sticky;top:0;z-index:10;box-shadow:0 2px 14px rgba(15,37,96,.25)}
.h-inner{max-width:880px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-weight:700;letter-spacing:.06em;font-size:15px;min-width:0}
.brand img{width:36px;height:36px;object-fit:contain;flex-shrink:0}
.brand span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tel{flex-shrink:0;background:linear-gradient(135deg,#FF4E70,#FF7A0F 55%,#FFBD3A);color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 18px;border-radius:999px;box-shadow:0 4px 14px rgba(255,122,15,.4)}
.wrap{max-width:760px;margin:40px auto;padding:0 20px 72px}
.crumb{font-size:12px;color:#3A4A66;margin-bottom:16px;letter-spacing:.04em}
.crumb a{color:#1F52B0;text-decoration:none}
article.card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 14px 40px -18px rgba(15,37,96,.3)}
article.card img{width:100%;display:block;max-height:520px;object-fit:cover}
.card-body{padding:34px 36px 42px}
.date{display:inline-block;font-family:'Outfit',sans-serif;font-size:13px;font-weight:700;color:#FF7A0F;letter-spacing:.14em}
h1{margin:12px 0 24px;font-size:23px;line-height:1.6;font-weight:700;color:#0F1E3F;letter-spacing:.03em;word-break:auto-phrase}
.r-title{word-break:auto-phrase}
.text{font-size:15.5px;line-height:2.05;white-space:pre-wrap;color:#3A4A66;word-break:break-word}
.cta-box{margin-top:36px;padding:26px 24px;border-radius:14px;background:linear-gradient(120deg,#1F52B0 0%,#8A6EDC 45%,#FF6B5B 85%,#FFD84C 120%);color:#fff;text-align:center}
.cta-box p{font-size:14px;margin-bottom:14px;line-height:1.8}
.cta-box a{display:inline-block;background:#fff;color:#0F2560;font-weight:700;text-decoration:none;padding:12px 30px;border-radius:999px;letter-spacing:.06em}
.recent{margin-top:44px}
.recent h2{font-size:15px;color:#0F2560;letter-spacing:.12em;margin-bottom:14px;padding-left:12px;border-left:4px solid #FF7A0F}
.recent ul{list-style:none;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px -18px rgba(15,37,96,.25)}
.recent li+li{border-top:1px solid rgba(31,82,176,.1)}
.recent a{display:flex;gap:14px;padding:14px 18px;text-decoration:none;color:#0F1E3F;transition:background .25s}
.recent a:hover{background:#FFF6EC}
.r-date{flex-shrink:0;font-family:'Outfit',sans-serif;font-size:12px;color:#FF7A0F;font-weight:700;padding-top:2px}
.r-title{font-size:14px;line-height:1.6}
.back-wrap{margin-top:40px;text-align:center}
.back-btn{display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#FF4E70,#FF7A0F 55%,#FFBD3A);color:#fff;text-decoration:none;border-radius:999px;font-weight:700;letter-spacing:.08em;box-shadow:0 6px 20px rgba(255,122,15,.4);transition:transform .3s}
.back-btn:hover{transform:translateY(-2px)}
.produced-by{text-align:center;margin-top:52px;font-size:11px;letter-spacing:.2em;color:rgba(15,37,96,.45)}
.produced-by a{color:rgba(15,37,96,.65);text-decoration:none}
@media (max-width:600px){.wrap{margin:24px auto;padding:0 14px 56px}.card-body{padding:24px 20px 30px}h1{font-size:19px;margin:10px 0 18px}.text{font-size:14.5px;line-height:1.95}.brand{font-size:13px}.brand img{width:30px;height:30px}.tel{font-size:12px;padding:8px 13px}.recent a{flex-direction:column;gap:2px}}
</style>

<script type="application/ld+json">
${JSON.stringify(jsonLd)}
</script>
<script type="application/ld+json">
${JSON.stringify(breadcrumb)}
</script>
</head>
<body>

<header>
  <div class="h-inner">
    <a class="brand" href="${SITE_URL}/"><img src="/logo.png" alt="" width="36" height="36"><span>${esc(STORE_NAME)}</span></a>
    <a class="tel" href="tel:${TEL.replace(/-/g, '')}">📞 ${TEL}</a>
  </div>
</header>

<div class="wrap">
  <nav class="crumb" aria-label="パンくず"><a href="${SITE_URL}/">トップ</a> › <a href="${SITE_URL}/#blog">お知らせ・ブログ</a></nav>
  <article class="card">
    ${imgUrl ? `<img src="${esc(imgUrl)}" alt="${esc(title)}" loading="eager">` : ''}
    <div class="card-body">
      ${date ? `<time class="date" datetime="${esc(date)}">${esc(dateFmt)}</time>` : ''}
      <h1>${esc(title)}</h1>
      <p class="text">${esc(bodyText)}</p>
      <div class="cta-box">
        <p>外壁塗装・屋根・防水・エアコンクリーニングのご相談は<br>現地調査・お見積もり無料です。</p>
        <a href="tel:${TEL.replace(/-/g, '')}">📞 ${TEL} に電話する</a>
      </div>
    </div>
  </article>
  ${recentHtml ? `<section class="recent"><h2>最新の記事</h2><ul>${recentHtml}</ul></section>` : ''}
  <div class="back-wrap">
    <a class="back-btn" href="${SITE_URL}/">← トップへ戻る</a>
  </div>
  <div class="produced-by">
    Produced by <a href="https://search-mania.net/" target="_blank" rel="noopener noreferrer">SearchMania Inc.</a>
  </div>
</div>

</body>
</html>`;
}

function renderNotFound() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>記事が見つかりません | ${esc(STORE_NAME)}</title>
<meta name="robots" content="noindex,follow">
<link rel="icon" type="image/png" href="/logo.png">
<style>
body{background:#FFF9F0;color:#0F1E3F;font-family:'Hiragino Sans',sans-serif;text-align:center;padding:120px 24px}
h1{font-size:24px;margin-bottom:16px}
p{color:#3A4A66;font-size:14px;margin-bottom:36px;line-height:1.9}
a.back{display:inline-block;padding:14px 36px;border:2px solid #FF7A0F;color:#FF7A0F;text-decoration:none;font-size:13px;letter-spacing:.2em;border-radius:999px}
</style>
</head>
<body>
<h1>記事が見つかりません</h1>
<p>指定された記事は削除されたか、URL が正しくない可能性があります。</p>
<a class="back" href="${SITE_URL}/">← トップへ戻る</a>
</body>
</html>`;
}

function renderError(msg) {
  return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><title>Error</title><meta name="robots" content="noindex,nofollow"></head>
<body style="font-family:sans-serif;padding:60px;text-align:center"><h1>一時的なエラー</h1><p>${esc(msg)}</p><p><a href="${SITE_URL}/">トップへ戻る</a></p></body></html>`;
}
