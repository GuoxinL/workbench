#!/bin/sh
# 发版脚本：更新静态资源版本号，强制所有浏览器在下次访问时拉取新 JS/CSS。
# 用法：每次改完代码、提交前执行  ./bump-version.sh
set -e
cd "$(dirname "$0")"
V="$(date +%Y%m%d-%H%M)"
# 更新 js/css 引用的 ?v= 参数
sed -i '' -E "s/(\.(js|css))\?v=[0-9A-Za-z-]+/\1?v=$V/g" index.html
# 更新页面版本号 meta
sed -i '' -E "s/(name=\"wb-version\" content=\")[^\"]+/\1$V/" index.html
echo "版本号已更新为 $V"
grep -n '?v=' index.html | head -3
