//go:build !prod

package main

import "net/http"

func addAccessControlHeaders(h http.Header) {
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	h.Set("Access-Control-Allow-Headers", "*")
	h.Set("Access-Control-Allow-Credentials", "true")
	h.Set("Access-Control-Max-Age", "86400")
}
