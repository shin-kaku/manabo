import { createSign } from "node:crypto";

// Service account needs Viewer access only to the image folders, not the Sheet.
export async function driveClient(credentials = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON, request = fetch) {
  if (!credentials) throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON이 필요합니다. 이미지 폴더에 Viewer 권한을 부여하세요.");
  let account;
  try { account = JSON.parse(credentials); } catch { throw new Error("Google 서비스 계정 JSON 형식 오류 (비밀 값은 출력하지 않습니다)."); }
  if (!account.client_email || !account.private_key) throw new Error("Google 서비스 계정 JSON이 올바르지 않습니다.");
  let token, expires = 0;
  async function accessToken() {
    if (token && Date.now() < expires) return token;
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
    const response = await request("https://oauth2.googleapis.com/token", {
      method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Google 인증 실패: HTTP ${response.status}`);
    const result = await response.json();
    if (!result.access_token) throw new Error("Google 토큰 응답 오류");
    token = result.access_token;
    expires = Date.now() + (Number(result.expires_in || 3600) - 120) * 1000;
    return token;
  }
  async function get(path, params) {
    const url = new URL(`https://www.googleapis.com/drive/v3/${path}`);
    url.search = new URLSearchParams(params).toString();
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await request(url, { headers: { authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(60000) });
      if (response.ok) return response;
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw new Error(`Drive 요청 실패: HTTP ${response.status}`);
      await response.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  return {
    async list() {
      const files = new Map();
      let pageToken;
      do {
        const response = await get("files", {
          q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
          spaces: "drive", pageSize: "1000", fields: "nextPageToken,incompleteSearch,files(id,mimeType,md5Checksum,size)",
          ...(pageToken ? { pageToken } : {}),
        });
        const body = await response.json();
        if (body.incompleteSearch || !Array.isArray(body.files)) throw new Error("Drive 파일 목록이 불완전합니다.");
        for (const file of body.files) files.set(file.id, file);
        pageToken = body.nextPageToken;
      } while (pageToken);
      return files;
    },
    async download(id) {
      if (!/^[\w-]+$/.test(id)) throw new Error("잘못된 Drive ID");
      const response = await get(`files/${id}`, { alt: "media" });
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > 30 * 1024 * 1024) throw new Error("Drive 원본이 30 MiB를 초과했습니다.");
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
  };
}
