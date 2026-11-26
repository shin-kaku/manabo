// 시트 데이터(마나보 저장소의 public/data) + 게임 보정(data/overrides.json) → 한 파일 HTML
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
  return [k,r["훈, 음"],r["풀이"],u?u.replace("/media/image1/","").replace(".webp",""):"",p,GRADES.indexOf(r["학년"]),+r["문부성"]||9999,r["발음"],r["예시단어"]]});
const byK=new Map(rows.map(r=>[r[0],r]));

// 2) 게임 보정. 시트 부품이 보정을 만들 때와 다르면(시트가 바뀜) 적용하지 않고 알린다.
const fixed=[];
for(const [k,o] of Object.entries(ov.parts)){const r=byK.get(k);
  if(!r){warn.push(`보정 대상이 시트에 없음: ${k}`);continue}
  if(JSON.stringify(r[4])!==JSON.stringify(o.sheet)){warn.push(`시트 부품이 바뀌어 보정을 건너뜀: ${k} 시트=${r[4].join("")} 보정 기준=${o.sheet.join("")} 게임=${o.game.join("")}`);continue}
  r[4]=[...o.game];if(o.label)fixed.push(k)}
for(const k of Object.keys(ov.links))if(!byK.has(k))warn.push(`links 대상이 시트에 없음: ${k}`);

// 3) 열 단위로 묶어 deflate-raw 압축, 그림 해시(32바이트)는 이진으로 따로.
const col=i=>rows.map(r=>r[i]);
const cardMeta = kanji.map(row => [row["등급"], row["학년"]].filter(Boolean).join(" · "));
const text=JSON.stringify([col(0),col(1),col(2),col(4).map(x=>x.join("")),col(5),col(6),col(7),col(8).map(s=>String(s).split("\n").filter(x=>x!=="-").join("\n")),cardMeta]);
const t=zlib.deflateRawSync(text,{level:9,memLevel:9});
const img=Buffer.concat(rows.map(r=>r[3]?Buffer.from(r[3],"hex"):Buffer.alloc(32)));
if(img.length!==rows.length*32)throw Error("그림 해시 길이");
const links=Object.fromEntries(Object.entries(ov.links).map(([k,v])=>[k,v.join("")]));
let html=fs.readFileSync(path.join(ROOT,"src","template.html"),"utf8");
for(const [p,v] of [["/*TEXT*/",JSON.stringify(t.toString("base64"))],["/*IMGS*/",JSON.stringify(img.toString("base64"))],["/*LINK*/",JSON.stringify(links)],["/*FIXED*/",JSON.stringify(fixed)]]){
  if(html.split(p).length!==2)throw Error("템플릿 자리표시 "+p);html=html.split(p).join(v)}
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,html);
console.log(`글자 ${rows.length} · 보정 ${Object.keys(ov.parts).length} (카드 표시 ${fixed.length}) · 게임 연결 ${Object.keys(links).length} · ${(Buffer.byteLength(html)/1024|0)}KB → ${OUT}`);
if(warn.length){console.log("확인 필요 "+warn.length+"건");for(const w of warn)console.log("  "+w);process.exitCode=1}
