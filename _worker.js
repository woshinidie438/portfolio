// Cloudflare Pages Advanced Mode
// 让视频支持 HTTP Range 请求（边下边播），其余请求交给静态资产。
const VIDEO_RE = /\.(mp4|webm|m4v|ogv)$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (VIDEO_RE.test(url.pathname)) {
      return serveVideo(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function serveVideo(request, env, url) {
  const asset = await env.ASSETS.fetch(url);
  if (!asset.ok) return asset;

  const contentType = asset.headers.get("Content-Type") || "video/mp4";
  const etag = asset.headers.get("ETag") || undefined;
  const buf = new Uint8Array(await new Response(asset.body).arrayBuffer());
  const total = buf.byteLength;

  const base = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
    "Access-Control-Allow-Origin": "*",
  };
  if (etag) base["ETag"] = etag;

  const range = request.headers.get("Range");
  if (!range) {
    return new Response(buf, {
      status: 200,
      headers: { ...base, "Content-Length": String(total) },
    });
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  let start;
  let end;
  if (m[1] === "" && m[2] !== "") {
    // suffix range，如 bytes=-500
    const n = parseInt(m[2], 10);
    start = Math.max(total - n, 0);
    end = total - 1;
  } else {
    start = m[1] ? parseInt(m[1], 10) : 0;
    end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= total) end = total - 1;
  }

  if (start >= total || start > end) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  const chunk = buf.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(chunk.byteLength),
      "Content-Range": `bytes ${start}-${end}/${total}`,
    },
  });
}
