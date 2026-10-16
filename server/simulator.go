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
		if path == "/calc-xrd/" {
			readPath(w, r, "static/calc-xrd-dist/index.html")
			return
		}
		// /calc-xrd/assets/... → 去掉前缀，从 calc-xrd-dist 读取
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
	f, err := os.Open(path)
	if err != nil {
		Error(w, toHTTPError(err))
		return
	}
	defer f.Close()

	d, err := f.Stat()
	if err != nil {
		Error(w, toHTTPError(err))
		return
	}

	if d.IsDir() {
		DirList(w, r, f)
		return
	}

	/*data, err := ioutil.ReadAll(f)
	if err != nil {
		Error(w, toHTTPError(err))
		return
	}

	ext := filepath.Ext(path)
	if contentType := extensionToContentType[ext]; contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}

	w.Header().Set("Content-Length", strconv.FormatInt(d.Size(), 10))
	w.Write(data)*/
}

func DirList(w http.ResponseWriter, r *http.Request, f http.File) {
	dirs, err := f.Readdir(-1)
	if err != nil {
		Error(w, http.StatusInternalServerError)
		return
	}
	sort.Slice(dirs, func(i, j int) bool { return dirs[i].Name() < dirs[j].Name() })

	// 注意：在当前的路由（/static/ 走 htmlbind.Asset）里，Asset 查不到目录
	// 节点会直接返回 404，DirList 实际上不会被触发。保留它并对输出做 HTML
	// 转义，防止将来有人把它重新接回 http.FileServer 路由时引入 XSS。
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintln(w, "<pre>")
	for _, d := range dirs {
		name := d.Name()
		if d.IsDir() {
			name += "/"
		}
		link := url.URL{Path: name}
		fmt.Fprintf(w, "<a href=\"%s\">%s</a>\n",
			html.EscapeString(link.String()), html.EscapeString(name))
	}
	fmt.Fprintln(w, "</pre>")
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
