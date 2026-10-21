/* Cloudflare Pages Function: /（トップページ）
 * シートの「よくある質問」を配信時に HTML へ埋め込む（住まいドクタースマイル）
 *
 * 目的:
 *   - FAQ はブラウザの JS（applyFAQ）で描画しているため、JS を実行しない AI 検索のクローラーには空に見える
 *   - 配信時に #faqList へ同じマークアップを入れ、#faq-jsonld（FAQPage）にシートの質問を追記する
 *   - CMS が遅い・落ちているときは何もせず元の HTML を返す（固定Q&Aの FAQPage はそのまま残る）
 *
 * Cache: GAS は応答に 5 秒ほどかかるので、取得した FAQ を Cache API に 1 日置き、
 *        15 分を過ぎたら配信後に裏で取り直す（ページはキャッシュ済みの FAQ ですぐ返す）
 */

const GAS_URL    = 'https://script.google.com/macros/s/AKfycbxLMJF5LcekgykRj2020apkN4x3dyj6x4xg58YLsYOqi0AhLzU1Eza1kh5z-kqExDNY/exec';
const CACHE_KEY  = 'https://cache.internal/sumai-doctor-smile/faq-v1';
const FRESH_MS   = 15 * 60 * 1000;   // これを過ぎたら裏で取り直す
const KEEP_SEC   = 24 * 60 * 60;     // GAS が落ちていてもこの間は前回の FAQ を使う
const WAIT_MS    = 1500;             // キャッシュが空のときだけ、この時間まで GAS を待つ

export async function onRequestGet(context) {
  const page = await context.next();
  const type = page.headers.get('Content-Type') || '';
  if (!page.ok || !type.includes('text/html')) return page;

  const faq = await getFaq(context);
  if (!faq.length) return page;

  let jsonText = '';
  return new HTMLRewriter()
    .on('#faqList', {
      element(el) { el.setInnerContent(faq.map(faqItemHtml).join(''), { html: true }); },
    })
    .on('#faq-jsonld', {
      text(chunk) {
        jsonText += chunk.text;
        if (!chunk.lastInTextNode) { chunk.remove(); return; }
        chunk.replace(mergeJsonLd(jsonText, faq), { html: true });
      },
    })
    .transform(page);
}

async function getFaq(context) {
  const cache = caches.default;
  let cached = null;
  try {
    const hit = await cache.match(CACHE_KEY);
    if (hit) cached = await hit.json();
  } catch (e) { cached = null; }

  if (cached && Array.isArray(cached.faq)) {
    if (Date.now() - (cached.at || 0) > FRESH_MS) context.waitUntil(refresh(cache));
    return cached.faq;
  }
  // キャッシュが空：少しだけ待ち、間に合わなければ今回は埋め込まずに返す（取得は裏で続ける）
  const job = refresh(cache);
  context.waitUntil(job);
  return Promise.race([job, new Promise(r => setTimeout(() => r([]), WAIT_MS))]);
}

async function refresh(cache) {
  try {
    const res = await fetch(GAS_URL, { redirect: 'follow' });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !Array.isArray(data.faq)) return [];   // 壊れた応答では前回のキャッシュを残す
    const faq = data.faq
      .map(f => ({ q: String(f.q || f.question || '').trim(), a: String(f.a || f.answer || '').trim() }))
      .filter(f => f.q && f.a);
    try {   // シートの FAQ を全部消したとき（空配列）も保存して、古い FAQ を残さない
      await cache.put(CACHE_KEY, new Response(JSON.stringify({ at: Date.now(), faq }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + KEEP_SEC },
      }));
    } catch (e) { /* 保存に失敗しても今回取れた FAQ は使う */ }
    return faq;
  } catch (e) {
    return [];
  }
}

/* index.html の applyFAQ と同じマークアップ */
function faqItemHtml(f) {
  return '<div class="faq-item">' +
    '<button class="faq-q" type="button">' + esc(f.q) + '</button>' +
    '<div class="faq-a">' + esc(f.a) + '</div>' +
  '</div>';
}

/* 固定Q&Aの FAQPage にシートの質問を足す（同じ質問は重ねない）。壊れていたら元のまま返す */
function mergeJsonLd(original, faq) {
  try {
    const ld = JSON.parse(original);
    const list = Array.isArray(ld.mainEntity) ? ld.mainEntity : [];
    const seen = new Set(list.map(q => q && q.name));
    faq.forEach(f => {
      if (seen.has(f.q)) return;
      seen.add(f.q);
      list.push({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } });
    });
    ld.mainEntity = list;
    return '\n' + JSON.stringify(ld, null, 2).replace(/</g, '\\u003c') + '\n';
  } catch (e) {
    return original;
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
