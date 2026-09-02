#!/bin/bash
# dsh-wallpaper 卸载脚本：撤掉软链与 patch 条目，恢复原样。
set -euo pipefail
PROFILE="$HOME/.dsh/profiles/web"
LINK="$PROFILE/node_modules/dsh-wallpaper"
PATCH="$PROFILE/cordis.patch.yml"

[ -L "$LINK" ] && rm "$LINK" && echo "· 已移除链接" || echo "· 链接不存在"

if grep -q 'id: dsh-wallpaper' "$PATCH" 2>/dev/null; then
  cp "$PATCH" "$PATCH.before-wallpaper-uninstall-$(date +%Y%m%d%H%M%S)"
  python3 - "$PATCH" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
s = re.sub(r"\n# dsh-wallpaper：.*?\n- insert:\n    - id: dsh-wallpaper\n      name: dsh-wallpaper\n",
           "", s, flags=re.S)
open(p, 'w', encoding='utf-8').write(s)
PY
  echo "· 已从 cordis.patch.yml 移除（原文件已备份）"
else
  echo "· cordis.patch.yml 中没有条目"
fi
echo
echo "卸载完成。重启后界面恢复原样：kill \$(pgrep -f 'dsh/lib/bin.js web')"
