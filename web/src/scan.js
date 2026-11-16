// Reads a photographed business card or badge with Cloudflare Workers AI and returns the contact's fields.
// The picture is only sent to the model; it is not stored.

const VISION_MODELS = [
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/google/gemma-3-12b-it',
];
const TEXT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const INSTRUCTIONS = `You read business cards and event badges. Reply with JSON only, no other words, in this shape:
{"name":"","title":"","company":"","department":"","emails":[""],"phones":[{"label":"mobile|work|other","value":""}],"website":"","address":"","linkedin":"","name_ar":"","title_ar":"","company_ar":""}
Rules: copy the details exactly as printed; leave a field empty when it is not on the card; phone numbers keep their + and country code;
"name" is the person's full name in Latin letters; put Arabic versions only in the *_ar fields; never invent details.`;

function pickJson(textOut) {
  if (textOut && typeof textOut === 'object') return textOut;
  const t = String(textOut || '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

function clean(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const emails = (Array.isArray(raw.emails) ? raw.emails : [raw.email]).map((e) => str(e, 120).toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 5);
  const phones = (Array.isArray(raw.phones) ? raw.phones : [raw.phone]).map((p) => (typeof p === 'string' ? { label: 'other', value: p } : p || {}))
    .map((p) => ({ label: ['mobile', 'work', 'other'].includes(p.label) ? p.label : 'other', value: str(p.value, 40) }))
    .filter((p) => (p.value.match(/\d/g) || []).length >= 6).slice(0, 5);
  const out = {
    name: str(raw.name, 80), title: str(raw.title, 80), company: str(raw.company, 80), department: str(raw.department, 80),
    emails, phones, website: str(raw.website, 200), address: str(raw.address, 160), linkedin: str(raw.linkedin, 200),
    ar: { name: str(raw.name_ar, 80), title: str(raw.title_ar, 80), company: str(raw.company_ar, 80) },
  };
  return out.name || out.company || emails.length || phones.length ? out : null;
}

const responseText = (r) => (r && (r.response ?? r.result?.response ?? r.choices?.[0]?.message?.content)) || r;

/**
 * image: a data: URL (JPEG/PNG). text: what the phone itself read from the card (optional, helps accuracy).
 * Returns { fields, model } or throws when no model could read it.
 */
export async function readBusinessCard(env, { image, text }) {
  if (!env.AI) throw new Error('Card reading is not set up.');
  const hint = text ? `\nText the phone read from the card (may contain mistakes):\n${String(text).slice(0, 2000)}` : '';
  let lastError = null;
  if (image) {
    for (const model of VISION_MODELS) {
      try {
        const r = await env.AI.run(model, {
          messages: [
            { role: 'system', content: INSTRUCTIONS },
            { role: 'user', content: [{ type: 'text', text: `Read this card.${hint}` }, { type: 'image_url', image_url: { url: image } }] },
          ],
          max_tokens: 700, temperature: 0,
        });
        const fields = clean(pickJson(responseText(r)));
        if (fields) return { fields, model };
      } catch (err) {
        lastError = err;
        console.warn('Card reading failed with', model, String(err));
      }
    }
  }
  if (text) {
    const r = await env.AI.run(TEXT_MODEL, {
      messages: [{ role: 'system', content: INSTRUCTIONS }, { role: 'user', content: `The card's text:\n${String(text).slice(0, 2000)}` }],
      max_tokens: 700, temperature: 0,
    });
    const fields = clean(pickJson(responseText(r)));
    if (fields) return { fields, model: TEXT_MODEL };
  }
  throw lastError || new Error('Nothing could be read from this picture.');
}
