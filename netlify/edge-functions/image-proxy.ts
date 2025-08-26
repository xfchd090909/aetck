// netlify/edge-functions/image-proxy.ts
// 注意：Netlify Edge Functions通过导出"handler"函数接收请求，而非addEventListener
export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // 核心逻辑：转发请求到目标域名（保留原始URL参数）
  url.hostname = "image.anosu.top"; // 与原Cloudflare逻辑一致

  try {
    // 1. 构造代理请求（模拟浏览器头，传递原始请求头）
    const proxyRequest = new Request(url.toString(), {
      method: request.method,
      headers: {
        // 自定义User-Agent（模拟浏览器，避免被目标API拒绝）
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        // 自定义Referer（替换为你的真实网站域名）
        "Referer": "https://aetck.netlify.app",
        // 传递原始请求头（注意：Netlify会过滤部分敏感头，如Host、Connection等）
        ...Object.fromEntries(request.headers.entries()),
      },
    });

    // 2. 发送代理请求并获取响应
    const response = await fetch(proxyRequest);

    // 3. 复制响应并添加CORS/安全头（与原逻辑一致）
    const modifiedResponse = new Response(response.body, response);
    // CORS配置：允许你的网站跨域访问
    modifiedResponse.headers.set("Access-Control-Allow-Origin", "https://aetck.netlify.app");
    modifiedResponse.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    // 安全头：防止MIME类型嗅探
    modifiedResponse.headers.set("X-Content-Type-Options", "nosniff");
    // 安全头：防御XSS攻击（可选）
    modifiedResponse.headers.set("X-XSS-Protection", "1; mode=block");

    return modifiedResponse;

  } catch (error) {
    // 4. 错误处理：返回500错误和明确提示
    return new Response(`转发失败: ${(error as Error).message}`, {
      status: 500,
      headers: {
        "X-Content-Type-Options": "nosniff",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
