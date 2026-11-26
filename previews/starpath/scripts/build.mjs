// 시트 데이터, 게임 보정, 확정된 모양 부품을 한 파일 HTML로 묶는다.
// 사용: node scripts/build.mjs [--src <public/data 폴더>] [--out <html 경로>]
import fs from "fs";import path from "path";import zlib from "zlib";import {fileURLToPath} from "url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arg=n=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:undefined};
const SRC=arg("--src")||process.env.MANABO_DATA_DIR||path.resolve(ROOT,"../../public/data");
const OUT=path.resolve(arg("--out")||path.join(ROOT,"dist","starpath.html"));
const kanji=JSON.parse(fs.readFileSync(path.join(SRC,"kanji.json"),"utf8"));
const media=JSON.parse(fs.readFileSync(path.join(SRC,"media.json"),"utf8")).items.image1;
const ov=JSON.parse(fs.readFileSync(path.join(ROOT,"data","overrides.json"),"utf8"));
const GRADES=["초등학교 1학년","초등학교 2학년","초등학교 3학년","초등학교 4학년","초등학교 5학년","초등학교 6학년","중학 1","중학 2","고교 1","고교 2","참고"];

// 1) 시트 → 행. 부품 = 풀이 괄호 안의 한자(첫 줄 순서, 다음 줄에서 새로 나온 것 덧붙임), 자기 자신은 뺀다.
const han=(line,k)=>[...line.matchAll(/[（(]([^()（）]+)[）)]/g)].flatMap(x=>[...x[1]]).filter(x=>/\p{Script=Han}/u.test(x)&&x!==k);
const warn=[];
const rows=kanji.map(r=>{const k=r["한자"],ls=String(r["풀이"]).split("\n");let p=han(ls[0],k);if(k==="化")p=[...new Set(p)];
  for(const l of ls.slice(1))for(const x of han(l,k))if(!p.includes(x))p.push(x);
  const id=(String(r["이미지 1"]).match(/\/d\/([\w-]+)/)||String(r["이미지 1"]).match(/id=([\w-]+)/)||[])[1],u=media[id]?.card?.url;
  if(!u)warn.push(`그림 없음: ${k}`);
  return [k,r["훈, 음"],r["풀이"],u?u.replace("/media/image1/","").replace(".webp",""):"",p,GRADES.indexOf(r["학년"]),+r["문부성"]||9999]});
const byK=new Map(rows.map(r=>[r[0],r]));

// 2) 게임 보정. 시트 부품이 보정을 만들 때와 다르면(시트가 바뀜) 적용하지 않고 알린다.
for(const [k,o] of Object.entries(ov.parts)){const r=byK.get(k);
  if(!r){warn.push(`보정 대상이 시트에 없음: ${k}`);continue}
  if(JSON.stringify(r[4])!==JSON.stringify(o.sheet)){warn.push(`시트 부품이 바뀌어 보정을 건너뜀: ${k} 시트=${r[4].join("")} 보정 기준=${o.sheet.join("")} 게임=${o.game.join("")}`);continue}
  r[4]=[...o.game]}
const links = Object.create(null);
for (const [glyph, parts] of Object.entries(ov.links)) {
  if (byK.has(glyph)) links[glyph] = parts.join("");
  else warn.push(`links 대상이 시트에 없음: ${glyph}`);
}

function reportWarnings() {
  console.error(`확인 필요 ${warn.length}건`);
  for (const message of warn) console.error("  " + message);
  process.exitCode = 1;
}

// 모양 부품을 넣기 전의 노드만 허용한다. 원래 풀이 부품의 반복과 순서는 rows에 그대로 둔다.
const graph = new Map(rows.map(row => [
  row[0], new Set([...row[4], ...(links[row[0]] || "")])
]));
for (const parts of graph.values()) {
  for (const part of parts) if (!graph.has(part)) graph.set(part, new Set());
}

function readShapes() {
  const filename = path.join(ROOT, "data", "shapes.json");
  try {
    const {shapes} = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (!shapes || typeof shapes !== "object" || Array.isArray(shapes)) {
      throw new Error("shapes 객체가 없습니다.");
    }
    return shapes;
  } catch (error) {
    if (error.code === "ENOENT") return {};
    warn.push(`shapes.json을 읽을 수 없음: ${error.message}`);
    reportWarnings();
    process.exit(1);
  }
}

const shapes = Object.create(null);
let shapeCount = 0;
for (const [glyph, record] of Object.entries(readShapes())) {
  const children = graph.get(glyph);
  if (!children || !Array.isArray(record?.add)) {
    warn.push(children ? `모양 부품 add 배열이 없음: ${glyph}` : `모양 부품 대상이 기존 노드에 없음: ${glyph}`);
    continue;
  }
  const additions = [];
  for (const part of record.add) {
    if (!graph.has(part)) warn.push(`모양 부품이 기존 노드에 없음: ${glyph} → ${part}`);
    else if (children.has(part)) warn.push(`이미 있는 아래 부품을 모양 부품에서 제외: ${glyph} → ${part}`);
    else {
      children.add(part);
      additions.push(part);
    }
  }
  if (additions.length) shapes[glyph] = additions.join("");
  shapeCount += additions.length;
}

function findCycle() {
  const finished = new Set(), visiting = new Set(), trail = [];
  function visit(glyph) {
    if (visiting.has(glyph)) return [...trail.slice(trail.indexOf(glyph)), glyph];
    if (finished.has(glyph)) return;
    visiting.add(glyph);
    trail.push(glyph);
    for (const child of graph.get(glyph)) {
      const cycle = visit(child);
      if (cycle) return cycle;
    }
    trail.pop();
    visiting.delete(glyph);
    finished.add(glyph);
  }
  for (const glyph of graph.keys()) {
    const cycle = visit(glyph);
    if (cycle) return cycle;
  }
}
const cycle = findCycle();
if (cycle) {
  warn.push(`아래 부품 순환: ${cycle.join(" → ")}`);
  reportWarnings();
  process.exit(1);
}

// 3) 열 단위로 묶어 deflate-raw 압축, 그림 해시(32바이트)는 이진으로 따로.
const col=i=>rows.map(r=>r[i]);
const cardMeta = kanji.map(row => [row["등급"], row["학년"]].filter(Boolean).join(" · "));
const text=JSON.stringify([col(0),col(1),col(2),col(4).map(x=>x.join("")),col(5),col(6),cardMeta]);
const t=zlib.deflateRawSync(text,{level:9,memLevel:9});
const img=Buffer.concat(rows.map(r=>r[3]?Buffer.from(r[3],"hex"):Buffer.alloc(32)));
if(img.length!==rows.length*32)throw Error("그림 해시 길이");
let html=fs.readFileSync(path.join(ROOT,"src","template.html"),"utf8");
for(const [p,v] of [["/*TEXT*/",JSON.stringify(t.toString("base64"))],["/*IMGS*/",JSON.stringify(img.toString("base64"))],["/*LINK*/",JSON.stringify(links)],["/*SHAPE*/",JSON.stringify(shapes)]]){
  if(html.split(p).length!==2)throw Error("템플릿 자리표시 "+p);html=html.split(p).join(v)}
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,html);
console.log(`글자 ${rows.length} · 보정 ${Object.keys(ov.parts).length} · 게임 연결 ${Object.keys(links).length} · 모양 부품 ${Object.keys(shapes).length}자 ${shapeCount}건 · ${(Buffer.byteLength(html)/1024|0)}KB → ${OUT}`);
if (warn.length) reportWarnings();
