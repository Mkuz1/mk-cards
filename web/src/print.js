// Uploaded artwork for printed cards (company card designer) is cleaned before it is stored or shown.

/** Keeps the drawing, removes anything that could run code or load other files. */
export function sanitizeSvg(text) {
  let s = String(text || '').replace(/^﻿/, '');
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '').replace(/<script[^>]*\/>/gi, '');
  s = s.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  // Images and fonts must be embedded (data:); links to other files and scripts are dropped.
  s = s.replace(/\s(xlink:href|href)\s*=\s*("|')\s*(?!data:|#)[^"']*\2/gi, '');
  if (!/<svg[\s>]/i.test(s)) throw new Error('That file is not an SVG drawing.');
  return s;
}
