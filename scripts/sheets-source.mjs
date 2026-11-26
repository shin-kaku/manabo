import { createSign } from "node:crypto";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const expectedHeaders = [
  "이미지 번호", "암기순", "문부성", "한자", "훈, 음", "훈", "음", "학년", "등급", "획", "획순",
  "마나보 제안 연관 한자", "풀이", "수정 내용", "이미지(TCG)", "이미지(ML)", "획(인쇄용)",
  "획(모션)", "획(g2)", "음, 훈", "예시 단어",
];
const text = value => typeof value === "string" ? value.trim() : value ?? "";

export function sheetValuesToPayload(kanjiValues, storyValues) {
  if (!Array.isArray(kanjiValues) || !Array.isArray(storyValues)) throw Error("시트 응답 형식 오류");
  if (JSON.stringify(kanjiValues[0]) !== JSON.stringify(expectedHeaders)) {
    throw Error("도감 DB 열 구조가 변경되어 동기화를 중단했습니다.");
  }
  if (storyValues.length > 4 && storyValues.slice(4).some(row => row.some(value => text(value) !== ""))) {
    throw Error("독해 DB에 새 행이 있어 변환 방식을 확인해야 합니다.");
  }
  const kanji = kanjiValues.slice(1)
    .map((row, index) => ({
      ...Object.fromEntries(expectedHeaders.map((header, column) => [header, row[column] ?? ""])),
      _row: index + 2,
    }))
    .filter(row => text(row["한자"]) !== "");
  const categories = storyValues[0] || [];
  const levels = storyValues[1] || [];
  const titles = storyValues[2] || [];
  const bodies = storyValues[3] || [];
  if (![categories, levels, titles, bodies].every(row => row.length === 19)) {
    throw Error("독해 DB 열 구조가 변경되어 동기화를 중단했습니다.");
  }
  const stories = levels.map((level, index) => ({
    id: `story-${index + 1}`,
    category: String(text(categories[index])).replace(/\s+/g, ""),
    level: text(level),
    title: text(titles[index]),
    versions: [{ label: "V1", body: text(bodies[index]) }],
  }));
  return { ok: true, kanji, stories };
}

export async function readAuthenticatedSheets({ credentials, spreadsheetId, request = fetch }) {
  if (!credentials || !/^[\w-]+$/.test(spreadsheetId || "")) throw Error("시트 인증 설정이 필요합니다.");
  let account;
  try { account = JSON.parse(credentials); } catch { throw Error("서비스 계정 JSON 형식 오류"); }
  if (!account.client_email || !account.private_key) throw Error("서비스 계정 JSON 형식 오류");
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: account.client_email, scope: SHEETS_SCOPE, aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
  const tokenResponse = await request("https://oauth2.googleapis.com/token", {
    method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    signal: AbortSignal.timeout(30000),
  });
  if (!tokenResponse.ok) throw Error(`Google 인증 실패: HTTP ${tokenResponse.status}`);
  const { access_token: token } = await tokenResponse.json();
  if (!token) throw Error("Google 인증 응답 오류");
  const metadataUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`);
  metadataUrl.searchParams.set("fields", "sheets(properties(title,gridProperties(rowCount,columnCount)))");
  const metadataResponse = await request(metadataUrl, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000),
  });
  if (!metadataResponse.ok) {
    const error = await metadataResponse.json().catch(() => ({}));
    const reason = error.error?.details?.find(detail => detail.reason)?.reason || error.error?.status || "UNKNOWN";
    throw Error(`Sheets 메타데이터 읽기 실패: HTTP ${metadataResponse.status}, ${reason}`);
  }
  const metadata = await metadataResponse.json();
  const dimensions = new Map((metadata.sheets || []).map(sheet => [sheet.properties?.title, sheet.properties?.gridProperties]));
  const kanjiGrid = dimensions.get("한자: 도감 DB");
  const storyGrid = dimensions.get("한자: 독해 DB");
  if (!kanjiGrid || !storyGrid || kanjiGrid.columnCount !== 21 || storyGrid.columnCount !== 19 ||
      !Number.isSafeInteger(kanjiGrid.rowCount) || !Number.isSafeInteger(storyGrid.rowCount)) {
    throw Error("시트의 이름 또는 열 구조가 변경되어 동기화를 중단했습니다.");
  }
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet`);
  url.searchParams.append("ranges", `'한자: 도감 DB'!A1:U${kanjiGrid.rowCount}`);
  url.searchParams.append("ranges", `'한자: 독해 DB'!A1:S${storyGrid.rowCount}`);
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  const response = await request(url, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error(`Sheets 읽기 실패: HTTP ${response.status}`);
  const data = await response.json();
  if (data.valueRanges?.length !== 2) throw Error("시트 범위 응답 오류");
  return sheetValuesToPayload(data.valueRanges[0].values, data.valueRanges[1].values);
}
