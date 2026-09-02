#!/bin/bash
# dsh-wallpaper 安装脚本（幂等）。在插件仓库根目录运行。
#   1. 把插件目录软链进 live profile 的 node_modules
#   2. 往 cordis.patch.yml 追加 insert 条目（已有副本则跳过）
#   3. 提示重启（launchd KeepAlive 会自动拉起）
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$HOME/.dsh/profiles/web"
LINK="$PROFILE/node_modules/dsh-wallpaper"
PATCH="$PROFILE/cordis.patch.yml"

[ -f "$PLUGIN_DIR/lib/index.js" ] || { echo "找不到插件源码: $PLUGIN_DIR/lib/index.js"; exit 1; }
[ -d "$PROFILE" ]              || { echo "找不到 DSH profile: $PROFILE"; exit 1; }

if [ -L "$LINK" ] || [ -e "$LINK" ]; then
  echo "· 链接已存在，跳过: $LINK"
else
  ln -s "$PLUGIN_DIR" "$LINK"
  echo "· 已链接: $LINK -> $PLUGIN_DIR"
fi

if grep -q 'id: dsh-wallpaper' "$PATCH" 2>/dev/null; then
  echo "· cordis.patch.yml 已包含 dsh-wallpaper，跳过"
else
  cp "$PATCH" "$PATCH.before-wallpaper-$(date +%Y%m%d%H%M%S)"
  cat >> "$PATCH" <<'YAML'

# dsh-wallpaper：整体背景图片（本地图库 + 在线搜索 + 本地导入）。
# 设置 → 通用 → 外观（暗黑模式）下方新增「背景图片」一行，点开为居中弹窗。
- insert:
    - id: dsh-wallpaper
      name: dsh-wallpaper
YAML
  echo "· 已写入 cordis.patch.yml（原文件已备份）"
fi

echo
echo "安装完成。重启 DSH web 让插件生效："
echo "  kill $(pgrep -f 'dsh/lib/bin.js web')      # launchd KeepAlive 会在 10 秒内自动拉起"
echo "然后刷新 http://127.0.0.1:3080 ，进入 设置 → 通用，暗黑模式下面就是「背景图片」。"
