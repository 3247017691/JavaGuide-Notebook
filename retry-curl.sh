#!/bin/bash
# 用 curl 重试 img-failures.txt 里的图片（修正：retry-list 生成逻辑）
cd "$(dirname "$0")"
export all_proxy=http://127.0.0.1:7892
rm -f data/img-failures2.txt
node -e '
const fs=require("fs");
const map=JSON.parse(fs.readFileSync("data/image-map.json","utf8"));
const fails=fs.readFileSync("data/img-failures.txt","utf8").split("\n").filter(Boolean).map(l=>l.split(" :: ")[0]);
const out=fails.map(u=>[u,map[u]]).filter(([u,l])=>l);
fs.writeFileSync("data/retry-list.tsv", out.map(p=>p[0]+" "+p[1]).join("\n"));
console.log("待重试:",out.length);
'
ok=0; bad=0; skip=0
while read -r url dest; do
  [ -z "$url" ] && continue
  f="public$dest"
  if [ -s "$f" ]; then skip=$((skip+1)); continue; fi
  code=$(curl -sk --compressed --max-time 30 --retry 2 -o "$f" -w "%{http_code}" "$url")
  if [ "$code" = "200" ] && [ -s "$f" ]; then ok=$((ok+1)); else bad=$((bad+1)); rm -f "$f"; echo "$url" >> data/img-failures2.txt; fi
done < data/retry-list.tsv
echo "curl 成功 $ok / 仍失败 $bad / 已有跳过 $skip"
