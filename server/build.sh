#!/usr/bin/env bash
# build.sh — 打包 CalcXRD 单 exe
#
# 一条命令完成：
#   0. 检查 web/dist 是否落后于 web/src，落后则自动 npm run build
#   1. 白名单重新生成 htmlbind/static.go（直接 embed ../web/dist，无中间副本）
#   2. go build 出 CalcXRD.exe
#   3. go test 验证路由/embed 正确性
#   4. 打印最终 exe 大小 + 确认无 OMC 垃圾
#
# 用法：
#   bash build.sh            # 在仓库内生成 CalcXRD.exe
#   bash build.sh -o dist/   # 输出到指定路径（相对 server/）
#
# 前置条件：web/dist/ 必须存在（由本脚本第 0 步保证）。
# embed 的 web 侧产物 key 前缀固定为 "web-dist/"（即 htmlbind 里的
# "web-dist/index.html"、"web-dist/assets/xxx.js" 等），simulator.go 的
# /calc-xrd/ 路由直接查这个前缀，不再依赖任何中间拷贝目录。

set -euo pipefail
cd "$(dirname "$0")"

OUT="CalcXRD.exe"
if [[ "${1:-}" == "-o" ]]; then
  OUT="${2:?-o 需要一个目标路径}"
fi

GO_BIN="/d/Program Files/Go/bin"
if ! command -v go >/dev/null 2>&1; then
  export PATH="$PATH:$GO_BIN"
fi

# go-bindata：优先 PATH，回退到 ~/go/bin
GO_BINDATA="$(command -v go-bindata 2>/dev/null || true)"
[[ -z "$GO_BINDATA" ]] && GO_BINDATA="$HOME/go/bin/go-bindata.exe"
if [[ ! -x "$GO_BINDATA" ]]; then
  echo "错误：找不到 go-bindata，请安装（go install github.com/jteeuwen/go-bindata/go-bindata@latest）" >&2
  exit 1
fi

# ── 0. web 侧检查：确保 web/dist 不落后于 web/src ─────────────────────────────
# 打包直接 embed ../web/dist（go-bindata 支持从 module 根之外读取文件，
# 只要在 build 时路径可达即可）。web/dist 是 Vite 构建产物，若 web/src 比它
# 更新，说明 UI 有未构建的改动——自动 npm run build，避免打出带旧 UI 的 exe。
WEB_ROOT="$(cd "$(dirname "$0")/../web" && pwd)"
WEB_DIST="$WEB_ROOT/dist"
# Windows 绝对路径版（cmd //c 下 mklink 用）
WEB_DIST_WIN="$(cygpath -w "$WEB_DIST")"
if [[ -f "$WEB_ROOT/src/routes.tsx" ]]; then
  newest_src=$(find "$WEB_ROOT/src" "$WEB_ROOT/vite.config.ts" -type f 2>/dev/null \
    | xargs -r ls -t 2>/dev/null | head -1)
  dist_html="$WEB_DIST/index.html"
  if [[ -n "$newest_src" && ! -f "$dist_html" ]]; then
    echo "==> web/dist 缺失，先执行 npm run build ..."
    (cd "$WEB_ROOT" && npm run build)
  elif [[ -n "$newest_src" ]]; then
    src_newer=$(find "$WEB_ROOT/src" -type f -newer "$dist_html" 2>/dev/null | head -1)
    if [[ -n "$src_newer" ]]; then
      echo "==> 检测到 web/src 比 dist 新（$src_newer），执行 npm run build ..."
      (cd "$WEB_ROOT" && npm run build)
    else
      echo "==> web/dist 已是最新，跳过 npm build"
    fi
  fi
  # 确保 embed 源是 Junction → ../web/dist（无中间拷贝：npm run build 后
  # 重新跑本脚本即可自动嵌最新产物）。Junction 无需管理员权限（cmd mklink /J）。
  JUNC="static/calc-xrd-dist"
  if [[ ! -L "$JUNC" && ! -d "$JUNC" ]]; then
    cmd //c "mklink /J static\\calc-xrd-dist $WEB_DIST_WIN" >/dev/null 2>&1 \
      || { echo "错误：创建 Junction 失败" >&2; exit 1; }
  elif [[ ! -e "$JUNC/index.html" ]]; then
    # 目录在但指向失效（web/dist 被删）——重建
    rm -rf "$JUNC" 2>/dev/null || true
    cmd //c "mklink /J static\\calc-xrd-dist $WEB_DIST_WIN" >/dev/null 2>&1 \
      || { echo "错误：重建 Junction 失败" >&2; exit 1; }
  fi
  # embed 源必须是完整产物（至少含 index.html），否则 bindata 会缺文件
  if [[ ! -e "$JUNC/index.html" ]]; then
    echo "错误：$JUNC/index.html 不可达（Junction 失效或 npm run build 未成功）" >&2
    exit 1
  fi
  echo "==> 就绪：embed 源 = $JUNC（Junction → $WEB_DIST，$(find -L "$JUNC" -type f | wc -l) 个文件）"
fi

# ── 1. 白名单重新生成 bindata（走 Junction → web/dist，无中间拷贝目录）──────
echo "==> 重新生成 htmlbind/static.go（白名单）..."
"$GO_BINDATA" -pkg htmlbind -o htmlbind/static.go \
  ./static/calc-xrd-dist/... \
  ./static/home/... \
  ./static/simulator/xrd_simulator/...

omc_refs=$(grep -c '\.omc' htmlbind/static.go || true)
echo "    .omc 垃圾引用: $omc_refs（应为 0）"
if [[ "$omc_refs" != "0" ]]; then
  echo "错误：bindata 中检测到 .omc 目录，请清理后重试" >&2
  exit 1
fi

# ── 2. 编译 ──────────────────────────────────────────────────────────────────
echo "==> 编译 $OUT ..."
go build -o "$OUT" .
exec_size=$(du -h "$OUT" | cut -f1)
echo "    构建完成: $(pwd)/$OUT ($exec_size)"

# ── 3. 测试（路由/embed 回归验证）───────────────────────────────────────────
echo "==> 运行测试..."
go test -run TestCalcXRDAssetKeys -v 2>&1 | grep -E "^(=== RUN|--- |PASS|FAIL|ok|.*probe=)" | sed 's/^/    /'

# ── 4. 冒烟测试（起服务 → curl 各路由 → 停服务）────────────────────────────
# 默认用 8080 避免与已占用的 80 端口冲突；可用 SMOKE_PORT=80 覆盖。
echo "==> 冒烟测试（起服务 → curl 各路由 → 停服务）..."
SMOKE_PORT="${SMOKE_PORT:-8080}"
SMOKE_PID=""
smoke_check() {
  local url="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$SMOKE_PORT$url")
  echo "    GET $url -> $code"
  [[ "$code" =~ ^[23] ]] || { echo "    错误：$url 返回 $code（非 2xx/3xx）" >&2; return 1; }
}
if [[ -f "./$OUT" ]]; then
  # Go 服务默认监听 :80；PORT 环境变量可覆盖（见 simulator.go）
  PORT="$SMOKE_PORT" "./$OUT" > /dev/null 2>&1 &
  SMOKE_PID=$!
  sleep 2
  set +e
  smoke_check "/"
  smoke_check "/calc-xrd/"
  # 探测一个 index.html 里实际引用的 asset（哈希随构建变，不写死）
  asset=$(grep -o '/calc-xrd/assets/[^"]*\.js' "static/calc-xrd-dist/index.html" 2>/dev/null | head -1 || true)
  if [[ -n "$asset" ]]; then
    smoke_check "$asset"
  else
    echo "    警告：index.html 里未找到 asset 引用，跳过 asset 探测" >&2
  fi
  smoke_check "/simulator/XRD_simulator.html"
  smoke_check "/static/simulator/xrd_simulator/XRD_simulator.html"
  smoke_check "/static/home/index.html"
  smoke_rc=$?
  set -e
  kill "$SMOKE_PID" 2>/dev/null || true
  wait "$SMOKE_PID" 2>/dev/null || true
  if [[ $smoke_rc -ne 0 ]]; then
    echo "    错误：冒烟测试失败" >&2
    exit 1
  fi
else
  echo "    （无法定位 exe，跳过冒烟测试）"
fi

echo "==> 全部通过 ✓  输出: $OUT"
