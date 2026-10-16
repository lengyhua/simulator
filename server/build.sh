#!/usr/bin/env bash
# build.sh — 打包 CalcXRD 单 exe
#
# 一条命令完成：
#   1. 白名单重新生成 htmlbind/static.go（只打包三个模块目录，避免杂目录混入）
#   2. go build 出 CalcXRD.exe
#   3. go test 验证路由/embed 正确性
#   4. 打印最终 exe 大小 + 确认无 OMC 垃圾
#
# 用法：
#   bash build.sh            # 在仓库内生成 CalcXRD.exe
#   bash build.sh -o dist/   # 输出到指定路径（相对 server/）

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

# ── 1. 白名单重新生成 bindata ────────────────────────────────────────────────
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
