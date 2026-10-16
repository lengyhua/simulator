package main

// route_test.go — 回归测试：验证 /calc-xrd/ 路由的 asset key 映射逻辑
// 与 htmlbind 实际嵌入的数据是否一致。这是此前 /calc-xrd/ 404 排查
// 时留下的最小可复现用例，固化进 build.sh 的测试步骤。
//
// 探针不写死 Vite 产物的内容哈希（每次 `npm run build` 都会变，如
// index-XXXX.js），而是从嵌入的 index.html 里动态提取实际引用的
// asset 路径来探测——测试始终校验的是当前 embed 数据里的真实文件。

import (
	"fmt"
	"regexp"
	"strings"
	"testing"

	"simulator/htmlbind"
)

// mirrorAssetKey 复刻 simulator.go 里 /calc-xrd/ handler + readPath 的
// key 构造逻辑（含 readPath 去掉前导 "."/"/" 的行为）。
// 注意："/calc-xrd"（无斜杠）永远到不了 handler——Go ServeMux 会先
// 301 到 "/calc-xrd/"，所以只需处理带斜杠的形式。
func mirrorAssetKey(path string) string {
	var raw string
	if path == "/calc-xrd/" {
		raw = "static/calc-xrd-dist/index.html"
	} else {
		raw = "static/calc-xrd-dist/" + strings.TrimPrefix(path, "/calc-xrd/")
	}
	if strings.HasPrefix(raw, ".") {
		raw = raw[1:]
	}
	if strings.HasPrefix(raw, "/") {
		raw = raw[1:]
	}
	return raw
}

// entryAssetProbes 从嵌入的 index.html 里提取其实际引用的 asset 相对路径
// （<script src> / <link href>），作为 /calc-xrd/<asset> 探针。
// 这样无论 Vite 产物哈希怎么变，测试始终校验真实嵌入文件。
func entryAssetProbes(t *testing.T) []string {
	t.Helper()
	b, err := htmlbind.Asset("static/calc-xrd-dist/index.html")
	if err != nil {
		t.Fatalf("读 index.html 失败: %v", err)
	}
	re := regexp.MustCompile(`(?:src|href)="/calc-xrd/(assets/[^"]+)"`)
	matches := re.FindAllStringSubmatch(string(b), -1)
	if len(matches) == 0 {
		t.Fatalf("index.html 里找不到 /calc-xrd/assets/ 引用（构建产物变了？）")
	}
	probes := make([]string, 0, len(matches))
	seen := map[string]bool{}
	for _, m := range matches {
		if !seen[m[1]] {
			seen[m[1]] = true
			probes = append(probes, "/calc-xrd/"+m[1])
		}
	}
	return probes
}

func TestCalcXRDAssetKeys(t *testing.T) {
	// entry 本身
	if err := probeAsset(t, "/calc-xrd/"); err != nil {
		t.Fatal(err)
	}
	// index.html 里实际引用的 asset（哈希随构建变）
	for _, p := range entryAssetProbes(t) {
		if err := probeAsset(t, p); err != nil {
			t.Fatal(err)
		}
	}
}

func probeAsset(t *testing.T, path string) error {
	t.Helper()
	key := mirrorAssetKey(path)
	b, err := htmlbind.Asset(key)
	if err != nil {
		return fmt.Errorf("probe=%q -> key=%q 在 htmlbind 里找不到: %v", path, key, err)
	}
	if len(b) == 0 {
		return fmt.Errorf("probe=%q 返回 0 字节（空文件？）", path)
	}
	t.Logf("probe=%q -> key=%q OK (len=%d)", path, key, len(b))
	return nil
}
