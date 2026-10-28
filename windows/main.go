/*
 * MaxiChat für Windows
 * ------------------------------------------------------------------
 * Ein echtes Windows-Fenster (Win32) mit WebView2 — kein Browser-Tab.
 * Lädt die Web-App von maxichen.de, gleiches Konto wie Handy und Web.
 *
 * EHRLICH: Das ist KEINE native Compose-App. Es gibt keinen nativen
 * Windows-Code für MaxiChat; die Chat-Logik läuft im WebView2.
 * Wer das nicht will: die Web-Version im Browser tut dasselbe.
 */
package main

import (
	"os"
	"strings"

	webview2 "github.com/jchv/go-webview2"
)

const standardURL = "https://maxichen.de/"

func main() {
	url := standardURL
	if len(os.Args) > 1 && strings.HasPrefix(os.Args[1], "http") {
		url = os.Args[1]
	}

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  "MaxiChat 💗",
			Width:  1200,
			Height: 860,
			IconId: 0,
			Center: true,
		},
	})
	if w == nil {
		// WebView2 fehlt (z. B. Windows 7) — dann wenigstens sagen warum.
		println("MaxiChat braucht den Microsoft Edge WebView2-Runtime.\n" +
			"Installieren: https://go.microsoft.com/fwlink/p/?LinkId=2124703\n" +
			"Oder die Web-Version nutzen: " + standardURL)
		os.Exit(1)
	}
	defer w.Destroy()

	w.SetSize(1200, 860, webview2.HintNone)
	w.Navigate(url)
	w.Run()
}
