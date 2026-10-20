package main

import (
	"fmt"
	"html"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"simulator/htmlbind"
	"sort"
	"strconv"
	"strings"
)

/**
 @author: lengyanhua
	create at 2021/11/27
*/

var extensionToContentType = map[string]string{
	".html":  "text/html; charset=utf-8",
	".css":   "text/css; charset=utf-8",
	".js":    "application/javascript",
	".xml":   "text/xml; charset=utf-8",
	".jpg":   "image/jpeg",
	".svg":   "image/svg+xml",
	".png":   "image/png",
	".mp4":   "video/mp4",
	".woff2": "font/woff2",
	".woff":  "font/woff",
	".ttf":   "font/ttf",
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/static/", fileHandler)
	// React calc-xrd module: /calc-xrd/ serves the SPA entry point,
	// /calc-xrd/assets/ serves hashed JS/CSS/font bundles from the
	// embedded calc-xrd-dist directory.
	mux.HandleFunc("/calc-xrd/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		// 精确匹配 "/calc-xrd/" 本身时 ServeMux 直接进本 handler；
		// 而 "/calc-xrd"（无斜杠）会被 ServeMux 自动 301 → "/calc-xrd/"，
		// 所以这里只需处理前缀匹配（含斜杠本身）一种情况。
		//
		// embed key 前缀固定为 "static/calc-xrd-dist/"——build.sh 生成 bindata
		// 时走 ./static/calc-xrd-dist/... 白名单；该目录是 Junction，实指
		// ../web/dist（Vite 构建产物，无中间拷贝目录；见 build.sh 注释与
		// .gitignore）。npm run build 后 Junction 自动指向最新产物，重新跑
		// build.sh 即嵌进二进制。
		if path == "/calc-xrd/" {
			readPath(w, r, "static/calc-xrd-dist/index.html")
			return
		}
		// /calc-xrd/assets/... → 去掉前缀，从 calc-xrd-dist（Junction → web/dist）读取
		assetPath := "static/calc-xrd-dist/" + strings.TrimPrefix(path, "/calc-xrd/")
		readPath(w, r, assetPath)
	})
	// 旧版 jQuery 模拟器的短路由：/simulator/... 直接映射到
	// 嵌入的 static/simulator/xrd_simulator/...（原路径 /static/simulator/
	// 仍保留可用，二者同源）。
	mux.HandleFunc("/simulator/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/simulator/" {
			readPath(w, r, "static/simulator/xrd_simulator/XRD_simulator.html")
			return
		}
		sub := strings.TrimPrefix(path, "/simulator/")
		readPath(w, r, "static/simulator/xrd_simulator/"+sub)
	})
	mux.HandleFunc("/", func(writer http.ResponseWriter, request *http.Request) {
		// 根路径 serve 主页；/calc-xrd 无尾斜杠也进主页入口（SPA 由上面处理）
		if request.URL.Path == "/" || request.URL.Path == "/index.html" {
			readPath(writer, request, "static/home/index.html")
			return
		}
		http.NotFound(writer, request)
	})
	// 监听端口：默认 80（与原版一致）；可用环境变量 PORT 覆盖（例如 PORT=8080），
	// 便于在 80 被占用 / 无管理员权限的环境里做冒烟测试。
	addr := ":" + os.Getenv("PORT")
	if addr == ":" {
		addr = ":80"
	}
	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	println("*========================================*")
	println("|                                        |")
	println("| Start simulator service licensing 80.  |")
	println("| You can visit with Browser at:         |")
	println("|                   http://localhost     |")
	println("|                                        |")
	println("|         KEEP THIS WINDOW OPEN          |")
	println("|                                        |")
	println("*========================================*")

	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func fileHandler(w http.ResponseWriter, r *http.Request) {
	path := "." + r.URL.Path
	readPath(w, r, path)
}

func readPath(w http.ResponseWriter, r *http.Request, path string) {
	//fmt.Println(path)
	if strings.HasPrefix(path, ".") {
		path = path[1:]
	}
	if strings.HasPrefix(path, "/") {
		path = path[1:]
	}
	bytes, err := htmlbind.Asset(path)
	if err != nil {
		Error(w, toHTTPError(err))
		return
	}
	ext := filepath.Ext(path)
	if contentType := extensionToContentType[ext]; contentType != "" {
		w.Header().Set("Content-Type", contentType)
		if ext == ".mp4" {
			w.Header().Set("Accept-Ranges", "bytes")
		}
	}

	// 资源全部内嵌在二进制里，本地读取零成本；禁用浏览器缓存是为了保证
	// 重新构建后刷新页面一定能拿到最新 CSS/JS（否则旧的 .css 会被缓存，
	// 界面改动看不到）。
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	w.Header().Set("Content-Length", strconv.Itoa(len(bytes)))
	w.Write(bytes)
}

// DirList 保留为死代码兜底（当前路由全部走 htmlbind.Asset，目录节点查不到
// 会 404，此函数实际不会被触发）。若将来有人把它重新接回 http.FileServer
// 路由，输出已按文件名做 HTML 转义，不引入存储型 XSS。
func DirList(w http.ResponseWriter, r *http.Request, f http.File) {
	dirs, err := f.Readdir(-1)
	if err != nil {
		Error(w, http.StatusInternalServerError)
		return
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name() < dirs[j].Name() })

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = fmt.Fprintln(w, "<pre>")
	for _, d := range dirs {
		name := d.Name()
		if d.IsDir() {
			name += "/"
		}
		// name 来自文件名；url.PathEscape 防止文件名里的特殊字符（如 ?、#、"）
		// 破坏 href，再用 html.EscapeString 转义整段 HTML。
		escaped := html.EscapeString(name)
		_, _ = fmt.Fprintf(w, "<a href=\"%s\">%s</a>\n",
			html.EscapeString(url.PathEscape(name)), escaped)
	}
	_, _ = fmt.Fprintln(w, "</pre>")
}

func toHTTPError(err error) int {
	msg := err.Error()
	if os.IsNotExist(err) ||
		strings.Contains(msg, "not found") ||
		strings.Contains(msg, "No such file") ||
		strings.Contains(msg, "not exist") {
		return http.StatusNotFound
	}
	if os.IsPermission(err) {
		return http.StatusForbidden
	}
	return http.StatusInternalServerError
}

func Error(w http.ResponseWriter, code int) {
	w.WriteHeader(code)
}
